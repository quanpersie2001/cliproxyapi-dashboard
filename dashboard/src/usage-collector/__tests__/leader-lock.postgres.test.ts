import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {},
}));

import { PostgresCollectorLeaderLock } from "@/usage-collector/infra/leader-lock";

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
});
