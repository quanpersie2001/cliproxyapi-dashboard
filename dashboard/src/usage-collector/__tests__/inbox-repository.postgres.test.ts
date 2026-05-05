import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, type UsageQueueInbox } from "@/generated/prisma/client";
import { UsageQueueInboxStatus } from "@/generated/prisma/enums";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {},
}));
import { PrismaUsageQueueInboxRepository } from "@/usage-collector/repositories/inbox-repository";

const TEST_SOURCE_PREFIX = "vitest_claim_semantics";

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

  throw new Error("DATABASE_URL is required for inbox repository postgres integration test.");
}

async function ensureUsageQueueInboxTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      CREATE TYPE "UsageQueueInboxStatus" AS ENUM (
        'pending',
        'processed',
        'decode_failed',
        'process_failed',
        'discarded'
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "usage_queue_inbox" (
      "id" TEXT PRIMARY KEY DEFAULT ('inbox_' || md5(random()::text || clock_timestamp()::text)),
      "eventKey" TEXT,
      "requestId" TEXT,
      "provider" TEXT,
      "authType" TEXT,
      "authIndex" TEXT,
      "apiGroupKey" TEXT,
      "model" TEXT,
      "source" TEXT,
      "timestamp" TIMESTAMP(3),
      "rawMessage" TEXT NOT NULL,
      "status" "UsageQueueInboxStatus" NOT NULL DEFAULT 'pending',
      "attemptCount" INTEGER NOT NULL DEFAULT 0,
      "lastAttemptAt" TIMESTAMP(3),
      "processedAt" TIMESTAMP(3),
      "failedAt" TIMESTAMP(3),
      "discardedAt" TIMESTAMP(3),
      "failureReason" TEXT,
      "discardReason" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

describe("PrismaUsageQueueInboxRepository (Postgres integration)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const adapter = new PrismaPg({
      connectionString: resolveDatabaseUrl(),
    });
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
    await ensureUsageQueueInboxTable(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("claims disjoint rows for concurrent processors and increments attempt metadata", async () => {
    const source = `${TEST_SOURCE_PREFIX}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const now = new Date("2026-05-05T13:40:00.000Z");
    const repoA = new PrismaUsageQueueInboxRepository({
      prisma: prisma as never,
      now: () => now,
    });
    const repoB = new PrismaUsageQueueInboxRepository({
      prisma: prisma as never,
      now: () => now,
    });

    await prisma.usageQueueInbox.deleteMany({
      where: { source },
    });

    await repoA.storeRawMessages([
      {
        source,
        receivedAt: new Date("2026-05-05T13:30:00.000Z"),
        rawMessage: '{"request_id":"claim-a"}',
      },
      {
        source,
        receivedAt: new Date("2026-05-05T13:30:01.000Z"),
        rawMessage: '{"request_id":"claim-b"}',
      },
    ]);

    const [claimedA, claimedB] = await Promise.all([
      repoA.claimForProcessing({ maxRecords: 1 }),
      repoB.claimForProcessing({ maxRecords: 1 }),
    ]);

    expect(claimedA).toHaveLength(1);
    expect(claimedB).toHaveLength(1);
    expect(claimedA[0]?.id).not.toBe(claimedB[0]?.id);

    const persistedRows = await prisma.usageQueueInbox.findMany({
      where: { source },
      orderBy: { createdAt: "asc" },
    });
    expect(persistedRows).toHaveLength(2);
    expect(
      persistedRows.every((row: UsageQueueInbox) => row.status === UsageQueueInboxStatus.pending)
    ).toBe(true);
    expect(persistedRows.every((row: UsageQueueInbox) => row.attemptCount === 1)).toBe(true);
    expect(persistedRows.every((row: UsageQueueInbox) => row.lastAttemptAt !== null)).toBe(true);

    await prisma.usageQueueInbox.deleteMany({
      where: { source },
    });
  });
});
