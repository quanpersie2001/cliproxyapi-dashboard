import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaCollectorStateRepository } from "@/usage-collector/repositories/collector-state-repository";
import { UsageCollectorWorkerRunner } from "@/usage-collector/runner";

const verifySessionMock = vi.fn();
const validateOriginMock = vi.fn();
const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

let prismaClientForRoute: PrismaClient;

vi.mock("@/lib/auth/session", () => ({
  verifySession: verifySessionMock,
}));

vi.mock("@/lib/auth/origin", () => ({
  validateOrigin: validateOriginMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: loggerMock,
}));

vi.mock("@/lib/db", () => ({
  get prisma() {
    return prismaClientForRoute;
  },
}));

function resolveDatabaseUrl(): string {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const contents = fs.readFileSync(envLocalPath, "utf8");
    for (const line of contents.split("\n")) {
      if (!line.startsWith("DATABASE_URL=")) {
        continue;
      }
      return line.slice("DATABASE_URL=".length).trim();
    }
  }

  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  throw new Error("DATABASE_URL is required for route wake postgres integration test.");
}

async function ensureCollectorStateTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "collector_state" (
      "id" TEXT PRIMARY KEY,
      "lastCollectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastStatus" TEXT NOT NULL DEFAULT 'idle',
      "recordsStored" INTEGER NOT NULL DEFAULT 0,
      "errorMessage" TEXT,
      "wakeSequence" INTEGER NOT NULL DEFAULT 0,
      "wakeRequestedAt" TIMESTAMP(3),
      "wakeReason" TEXT,
      "lastWakeHandledAt" TIMESTAMP(3),
      "heartbeatAt" TIMESTAMP(3),
      "workerId" TEXT,
      "lastRunStartedAt" TIMESTAMP(3),
      "lastRunFinishedAt" TIMESTAMP(3),
      "backoffUntil" TIMESTAMP(3),
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "collector_state"
    ADD COLUMN IF NOT EXISTS "wakeSequence" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "wakeRequestedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "wakeReason" TEXT,
    ADD COLUMN IF NOT EXISTS "lastWakeHandledAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "heartbeatAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "workerId" TEXT,
    ADD COLUMN IF NOT EXISTS "lastRunStartedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "lastRunFinishedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "backoffUntil" TIMESTAMP(3);
  `);
}

async function loadPostHandler() {
  vi.resetModules();
  process.env.COLLECTOR_API_KEY = "collector-secret";
  const routeModule = await import("./route");
  return routeModule.POST;
}

function createRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/usage/collect", {
    method: "POST",
    headers,
  });
}

describe("POST /api/usage/collect (Postgres integration)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: resolveDatabaseUrl(),
      }),
    });
    prismaClientForRoute = prisma;

    await prisma.$connect();
    await ensureCollectorStateTable(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    verifySessionMock.mockResolvedValue(null);
    validateOriginMock.mockReturnValue(null);
    loggerMock.info.mockClear();
    loggerMock.warn.mockClear();
    loggerMock.error.mockClear();

    await prisma.collectorState.deleteMany({
      where: { id: "singleton" },
    });
  });

  it("persists wake sequence via route and lets worker observe + handle it", async () => {
    const POST = await loadPostHandler();

    const firstResponse = await POST(
      createRequest({
        authorization: "Bearer collector-secret",
      })
    );
    const firstPayload = await firstResponse.json();

    const secondResponse = await POST(
      createRequest({
        authorization: "Bearer collector-secret",
      })
    );
    const secondPayload = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstPayload.status).toBe("queued");
    expect(secondPayload.status).toBe("queued");

    const stateAfterRoute = await prisma.collectorState.findUnique({
      where: { id: "singleton" },
    });

    expect(stateAfterRoute).toBeTruthy();
    expect(stateAfterRoute?.wakeSequence).toBeGreaterThan(firstPayload.wakeSequence);
    expect(stateAfterRoute?.wakeReason).toBe("bearer");
    expect(stateAfterRoute?.wakeRequestedAt).toBeTruthy();

    const runner = new UsageCollectorWorkerRunner({
      workerId: "worker-proof",
      orchestrator: {
        pullOnce: vi.fn(),
        processOnce: vi.fn(),
        drainNow: vi.fn().mockResolvedValue({
          summary: {
            pulled: { pulled: 0, stored: 0, dropped: 0, durationMs: 1 },
            processed: {
              claimed: 0,
              processed: 0,
              decodeFailed: 0,
              processFailed: 0,
              discarded: 0,
              durationMs: 1,
            },
          },
        }),
      },
      lock: {
        withLeadership: vi.fn().mockImplementation(async (_workerId, run) => ({
          acquired: true,
          value: await run(),
        })),
      },
      stateRepository: new PrismaCollectorStateRepository({
        prisma: prisma as never,
      }),
      enabled: true,
      pullBatchSize: 50,
      processBatchSize: 50,
      idleMs: 1000,
      errorBackoffMs: 5000,
      sleep: async () => undefined,
    });

    const runResult = await runner.runOnce();

    expect(runResult.status).toBe("success");

    const stateAfterWorker = await prisma.collectorState.findUnique({
      where: { id: "singleton" },
    });

    expect(stateAfterWorker?.wakeSequence).toBe(stateAfterRoute?.wakeSequence ?? 0);
    expect(stateAfterWorker?.lastWakeHandledAt).toBeTruthy();
    expect(stateAfterWorker?.workerId).toBe("worker-proof");
  });
});
