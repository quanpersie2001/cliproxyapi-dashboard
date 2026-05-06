import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, PrismaClient } from "@/server/db/generated/prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  prisma: {},
}));

import { PostgresCollectorLeaderLock } from "@/server/jobs/workers/usage-collector/infra/leader-lock";

type AdvisoryLockRow = { acquired: boolean };
type AdvisoryUnlockRow = { released: boolean };

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

  throw new Error("DATABASE_URL is required for leader-lock postgres integration test.");
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

function createSessionSplitPrisma(
  lockClient: PrismaClient,
  unlockClient: PrismaClient
): PrismaClient {
  const routeQuery = async (...args: unknown[]) => {
    const queryText = getQueryText(args[0]).toLowerCase();
    if (queryText.includes("pg_advisory_unlock")) {
      return (unlockClient.$queryRaw as (...params: unknown[]) => Promise<unknown>)(...args);
    }
    return (lockClient.$queryRaw as (...params: unknown[]) => Promise<unknown>)(...args);
  };

  return {
    $queryRaw: routeQuery,
    $transaction: async (...args: unknown[]) => {
      const firstArg = args[0];
      if (typeof firstArg !== "function") {
        throw new Error("Expected interactive transaction callback.");
      }

      const callback = firstArg as (tx: { $queryRaw: (...params: unknown[]) => Promise<unknown> }) => Promise<unknown>;
      const transactionClient = {
        $queryRaw: routeQuery,
      };
      return callback(transactionClient);
    },
  } as PrismaClient;
}

function getQueryText(query: unknown): string {
  if (
    query &&
    typeof query === "object" &&
    "strings" in query &&
    Array.isArray((query as { strings?: unknown }).strings)
  ) {
    return ((query as { strings: string[] }).strings as string[]).join(" ");
  }

  return String(query ?? "");
}

describe("PostgresCollectorLeaderLock (Postgres integration)", () => {
  let prismaA: PrismaClient;
  let prismaB: PrismaClient;
  const lockKey = 942001;

  beforeAll(async () => {
    const connectionString = resolveDatabaseUrl();
    prismaA = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    prismaB = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });

    await prismaA.$connect();
    await prismaB.$connect();
  });

  afterAll(async () => {
    await prismaA.$disconnect();
    await prismaB.$disconnect();
  });

  it("enforces exclusive leadership under contention and releases lock for a later contender", async () => {
    const lockA = new PostgresCollectorLeaderLock({
      prisma: prismaA as never,
      lockKey,
    });
    const lockB = new PostgresCollectorLeaderLock({
      prisma: prismaB as never,
      lockKey,
    });

    let releaseLeaderRun!: () => void;
    const leaderRunHolding = new Promise<void>((resolve) => {
      releaseLeaderRun = resolve;
    });
    let leaderEntered = false;
    let markLeaderEntered!: () => void;
    const leaderEnteredPromise = new Promise<void>((resolve) => {
      markLeaderEntered = resolve;
    });

    const contenderA = lockA.withLeadership("worker-a", async () => {
      leaderEntered = true;
      markLeaderEntered();
      await leaderRunHolding;
      return "leader-a";
    });

    await leaderEnteredPromise;
    expect(leaderEntered).toBe(true);

    const contenderB = await lockB.withLeadership("worker-b", async () => "leader-b");
    expect(contenderB).toEqual({ acquired: false });

    releaseLeaderRun();
    const leaderResult = await contenderA;
    expect(leaderResult).toEqual({ acquired: true, value: "leader-a" });

    const contenderAfterRelease = await lockB.withLeadership("worker-b", async () => "leader-b");
    expect(contenderAfterRelease).toEqual({ acquired: true, value: "leader-b" });
  });

  it("fails when lock release is attempted from a different session", async () => {
    const splitSessionPrisma = createSessionSplitPrisma(prismaA, prismaB);
    const lock = new PostgresCollectorLeaderLock({
      prisma: splitSessionPrisma as never,
      lockKey,
    });

    try {
      await expect(lock.withLeadership("worker-a", async () => "leader-a")).rejects.toThrow(
        "Failed to release advisory lock"
      );

      const contenderWhileStuck = await prismaB.$queryRaw<AdvisoryLockRow[]>(
        Prisma.sql`SELECT pg_try_advisory_lock(${lockKey}) AS acquired`
      );
      expect(contenderWhileStuck[0]?.acquired).toBe(false);
    } finally {
      await prismaA.$queryRaw<AdvisoryUnlockRow[]>(
        Prisma.sql`SELECT pg_advisory_unlock(${lockKey}) AS released`
      );
    }
  });
});
