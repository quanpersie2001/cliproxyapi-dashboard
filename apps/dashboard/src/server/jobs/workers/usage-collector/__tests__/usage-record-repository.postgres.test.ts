import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/server/db/generated/prisma/client";
import type { NormalizedQueuedUsageEvent } from "@/server/jobs/workers/usage-collector/core/types";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  prisma: {},
}));
vi.mock("@/lib/cache", () => ({
  invalidateUsageCaches: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock("@/lib/providers/management-api", () => ({
  fetchWithTimeout: vi.fn(),
  MANAGEMENT_API_KEY: "test-management-api-key-1234",
  MANAGEMENT_BASE_URL: "https://management.test",
}));

import { PrismaUsageRecordRepository } from "@/server/jobs/workers/usage-collector/repositories/usage-record-repository";

function resolveDatabaseUrl(): string | null {
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

  return null;
}

const databaseUrl = resolveDatabaseUrl();
const describeIfDatabase = databaseUrl ? describe : describe.skip;

async function ensureUsageRecordDependencies(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "users" (
      "id" TEXT PRIMARY KEY,
      "username" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "user_api_keys" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "provider_oauth_ownerships" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "accountName" TEXT,
      "accountEmail" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "provider_key_ownerships" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "keyIdentifier" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "usage_records" (
      "id" TEXT PRIMARY KEY DEFAULT ('usage_' || md5(random()::text || clock_timestamp()::text)),
      "eventKey" TEXT,
      "requestId" TEXT,
      "provider" TEXT,
      "authType" TEXT,
      "authIndex" TEXT NOT NULL,
      "apiKeyId" TEXT,
      "userId" TEXT,
      "endpoint" TEXT,
      "model" TEXT NOT NULL,
      "modelAlias" TEXT,
      "source" TEXT NOT NULL,
      "timestamp" TIMESTAMP(3) NOT NULL,
      "latencyMs" INTEGER NOT NULL DEFAULT 0,
      "ttftMs" INTEGER,
      "inputTokens" INTEGER NOT NULL DEFAULT 0,
      "outputTokens" INTEGER NOT NULL DEFAULT 0,
      "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
      "cachedTokens" INTEGER NOT NULL DEFAULT 0,
      "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
      "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
      "totalTokens" INTEGER NOT NULL DEFAULT 0,
      "reasoningEffort" TEXT,
      "serviceTier" TEXT,
      "executorType" TEXT,
      "failed" BOOLEAN NOT NULL DEFAULT FALSE,
      "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "usage_records"
    ADD COLUMN IF NOT EXISTS "eventKey" TEXT,
    ADD COLUMN IF NOT EXISTS "requestId" TEXT,
    ADD COLUMN IF NOT EXISTS "provider" TEXT,
    ADD COLUMN IF NOT EXISTS "authType" TEXT,
    ADD COLUMN IF NOT EXISTS "authIndex" TEXT,
    ADD COLUMN IF NOT EXISTS "apiKeyId" TEXT,
    ADD COLUMN IF NOT EXISTS "userId" TEXT,
    ADD COLUMN IF NOT EXISTS "endpoint" TEXT,
    ADD COLUMN IF NOT EXISTS "model" TEXT,
    ADD COLUMN IF NOT EXISTS "modelAlias" TEXT,
    ADD COLUMN IF NOT EXISTS "source" TEXT,
    ADD COLUMN IF NOT EXISTS "timestamp" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "latencyMs" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "ttftMs" INTEGER,
    ADD COLUMN IF NOT EXISTS "inputTokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "outputTokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "totalTokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "reasoningEffort" TEXT,
    ADD COLUMN IF NOT EXISTS "serviceTier" TEXT,
    ADD COLUMN IF NOT EXISTS "executorType" TEXT,
    ADD COLUMN IF NOT EXISTS "failed" BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS "usage_records_eventKey_key";
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "usage_records_eventKey_idx" ON "usage_records"("eventKey");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "usage_dedup_key" ON "usage_records"("authIndex", "model", "timestamp", "source", "totalTokens");
  `);
}

function createEvent(eventKey: string, source: string): NormalizedQueuedUsageEvent {
  return {
    eventKey,
    requestId: `req-${eventKey}`,
    provider: "openai",
    authType: "api-key",
    authIndex: `auth-${eventKey}`,
    apiGroupKey: "/v1/chat/completions",
    model: "gpt-4.1",
    modelAlias: null,
    source,
    timestamp: new Date("2026-05-05T16:00:00.000Z"),
    failed: false,
    latencyMs: 120,
    ttftMs: null,
    reasoningEffort: null,
    serviceTier: null,
    executorType: null,
    tokens: {
      inputTokens: 10,
      outputTokens: 20,
      reasoningTokens: 0,
      cachedTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 30,
    },
  };
}

describeIfDatabase("PrismaUsageRecordRepository (Postgres integration)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl!,
      }),
    });

    await prisma.$connect();
    await ensureUsageRecordDependencies(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("skips exact duplicate writes by composite key without requiring unique eventKey", async () => {
    const source = `vitest_eventkey_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const duplicateEventKey = `evt_dup_${Date.now()}`;

    const repository = new PrismaUsageRecordRepository({
      prisma: prisma as never,
      ownershipCacheTtlMs: 0,
    });

    await prisma.usageRecord.deleteMany({
      where: {
        eventKey: duplicateEventKey,
      },
    });

    const firstWriteCount = await repository.persistNormalizedEvents([
      createEvent(duplicateEventKey, source),
    ]);
    const secondWriteCount = await repository.persistNormalizedEvents([
      createEvent(duplicateEventKey, source),
    ]);

    const rows = await prisma.usageRecord.findMany({
      where: {
        eventKey: duplicateEventKey,
      },
    });

    expect(firstWriteCount).toBe(1);
    expect(secondWriteCount).toBe(0);
    expect(rows).toHaveLength(1);

    await prisma.usageRecord.deleteMany({
      where: {
        eventKey: duplicateEventKey,
      },
    });
  });

  it("persists shared request/event keys when model segments differ", async () => {
    const source = `vitest_shared_request_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const duplicateEventKey = `evt_shared_${Date.now()}`;

    const repository = new PrismaUsageRecordRepository({
      prisma: prisma as never,
      ownershipCacheTtlMs: 0,
    });

    await prisma.usageRecord.deleteMany({
      where: {
        eventKey: duplicateEventKey,
      },
    });

    const count = await repository.persistNormalizedEvents([
      createEvent(duplicateEventKey, source),
      {
        ...createEvent(duplicateEventKey, source),
        model: "gpt-4.1-mini",
      },
    ]);

    const rows = await prisma.usageRecord.findMany({
      where: {
        eventKey: duplicateEventKey,
      },
      orderBy: {
        model: "asc",
      },
    });

    expect(count).toBe(2);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.model)).toEqual(["gpt-4.1", "gpt-4.1-mini"]);

    await prisma.usageRecord.deleteMany({
      where: {
        eventKey: duplicateEventKey,
      },
    });
  });
});
