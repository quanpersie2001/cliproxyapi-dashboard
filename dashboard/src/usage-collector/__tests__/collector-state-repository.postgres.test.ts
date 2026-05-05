import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {},
}));

import { PrismaCollectorStateRepository } from "@/usage-collector/repositories/collector-state-repository";

const REQUIRED_RUNTIME_COLUMNS = [
  "wakeSequence",
  "wakeRequestedAt",
  "wakeReason",
  "lastWakeHandledAt",
  "heartbeatAt",
  "workerId",
  "lastRunStartedAt",
  "lastRunFinishedAt",
  "backoffUntil",
] as const;

function resolveDatabaseUrl(): string {
  const dedicatedUrl = process.env.COLLECTOR_STATE_TEST_DATABASE_URL?.trim();
  if (dedicatedUrl) {
    return withSchemaSearchPath(dedicatedUrl);
  }

  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) {
    return withSchemaSearchPath(fromEnv);
  }

  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const contents = fs.readFileSync(envLocalPath, "utf8");
    for (const line of contents.split("\n")) {
      if (!line.startsWith("DATABASE_URL=")) {
        continue;
      }
      return withSchemaSearchPath(line.slice("DATABASE_URL=".length).trim());
    }
  }

  throw new Error("DATABASE_URL is required for collector_state postgres integration test.");
}

function withSchemaSearchPath(connectionString: string): string {
  const parsed = new URL(connectionString);
  const schema = parsed.searchParams.get("schema");
  if (!schema) {
    return connectionString;
  }

  const existingOptions = parsed.searchParams.get("options");
  const searchPathOption = `-c search_path=${schema}`;
  if (existingOptions && existingOptions.includes("search_path")) {
    return connectionString;
  }

  parsed.searchParams.set(
    "options",
    existingOptions ? `${existingOptions} ${searchPathOption}` : searchPathOption
  );
  return parsed.toString();
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

describe("PrismaCollectorStateRepository (Postgres integration)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: resolveDatabaseUrl(),
      }),
    });
    await prisma.$connect();
    await ensureCollectorStateTable(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("uses migrated collector_state columns for runtime wake and worker writes", async () => {
    const now = new Date("2026-05-05T16:20:00.000Z");
    const repo = new PrismaCollectorStateRepository({
      prisma: prisma as never,
      now: () => now,
    });

    const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'collector_state'"
    );
    const columns = new Set(rows.map((row) => row.column_name));

    for (const column of REQUIRED_RUNTIME_COLUMNS) {
      expect(columns.has(column)).toBe(true);
    }

    await repo.ensureSingletonState();

    await repo.markRunning("worker-alpha");
    await repo.markWakeHandled("worker-alpha", 7);
    await repo.markSuccess("worker-alpha", 12);

    const state = await prisma.collectorState.findUnique({
      where: { id: "singleton" },
    });
    expect(state).toBeTruthy();
    expect(state?.lastStatus).toBe("success");
    expect(state?.wakeSequence).toBe(7);
    expect(state?.workerId).toBe("worker-alpha");
    expect(state?.recordsStored).toBe(12);
    expect(state?.heartbeatAt).toBeTruthy();
    expect(state?.lastRunStartedAt).toBeTruthy();
    expect(state?.lastRunFinishedAt).toBeTruthy();
  });
});
