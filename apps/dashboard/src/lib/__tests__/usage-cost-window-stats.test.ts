import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  modelPricing: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/server/db/client", () => ({
  prisma: prismaMock,
}));

vi.mock("@/server/db/generated/prisma/client", () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  },
}));

describe("usage token cost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prices prompt, cached, output, and reasoning tokens with dashboard schema fields", async () => {
    const { calculateUsageTokenCost } = await import("@/lib/usage/cost");

    const cost = calculateUsageTokenCost({
      inputTokens: 1_000_000,
      cachedTokens: 250_000,
      outputTokens: 500_000,
      reasoningTokens: 100_000,
    }, {
      prompt: 2,
      cache: 0.5,
      completion: 8,
      reasoning: 1,
    });

    expect(cost).toBe(5.725);
  });

  it("clamps cached tokens to avoid negative prompt cost", async () => {
    const { calculateUsageTokenCost } = await import("@/lib/usage/cost");

    const cost = calculateUsageTokenCost({
      inputTokens: 10,
      cachedTokens: 20,
      outputTokens: 0,
      reasoningTokens: 0,
    }, {
      prompt: 2,
      cache: 1,
      completion: 8,
      reasoning: 0,
    });

    expect(cost).toBe(0.00002);
  });

  it("uses Claude-style cache read/create buckets when explicit cache fields exist", async () => {
    const { calculateUsageTokenCost } = await import("@/lib/usage/cost");

    const cost = calculateUsageTokenCost({
      inputTokens: 1_250_000,
      cacheReadTokens: 200_000,
      cacheCreationTokens: 50_000,
      cachedTokens: 200_000,
      outputTokens: 500_000,
      reasoningTokens: 0,
    }, {
      prompt: 3,
      cache: 0.3,
      completion: 15,
      reasoning: 0,
    });

    expect(cost).toBeCloseTo(10.71, 8);
  });
});

describe("sumUsageWindowStatsByAuthIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates raw usage by auth index and model, then prices model totals", async () => {
    prismaMock.modelPricing.findMany.mockResolvedValue([
      {
        provider: "codex",
        model: "gpt-5.1-codex",
        promptPriceUsd: "2",
        completionPriceUsd: "8",
        cachedPriceUsd: "0.5",
        reasoningPriceUsd: "1",
      },
      {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        promptPriceUsd: "3",
        completionPriceUsd: "15",
        cachedPriceUsd: "0.3",
        reasoningPriceUsd: null,
      },
    ]);
    prismaMock.$queryRaw.mockResolvedValue([
      {
        provider: "codex",
        model: "gpt-5.1-codex",
        totalTokens: BigInt(1_600_000),
        inputTokens: BigInt(1_000_000),
        cachedTokens: BigInt(250_000),
        cacheReadTokens: BigInt(0),
        cacheCreationTokens: BigInt(0),
        outputTokens: BigInt(500_000),
        reasoningTokens: BigInt(100_000),
      },
      {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        totalTokens: "1750000",
        inputTokens: "1250000",
        cachedTokens: "0",
        cacheReadTokens: "200000",
        cacheCreationTokens: "50000",
        outputTokens: "500000",
        reasoningTokens: "0",
      },
    ]);

    const { sumUsageWindowStatsByAuthIndex } = await import("@/lib/usage/window-stats");
    const stats = await sumUsageWindowStatsByAuthIndex(
      "7",
      new Date("2026-06-01T00:00:00.000Z"),
      new Date("2026-06-01T05:00:00.000Z")
    );

    expect(prismaMock.modelPricing.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: {
        provider: true,
        model: true,
        promptPriceUsd: true,
        completionPriceUsd: true,
        cachedPriceUsd: true,
        reasoningPriceUsd: true,
      },
    });
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(stats.tokens).toBe(3_350_000);
    expect(stats.cost).toBeCloseTo(16.435, 8);
  });

  it("counts tokens but leaves cost at zero when model pricing is missing", async () => {
    prismaMock.modelPricing.findMany.mockResolvedValue([]);
    prismaMock.$queryRaw.mockResolvedValue([
      {
        provider: "codex",
        model: "unpriced",
        totalTokens: BigInt(42),
        inputTokens: BigInt(40),
        cachedTokens: BigInt(0),
        cacheReadTokens: BigInt(0),
        cacheCreationTokens: BigInt(0),
        outputTokens: BigInt(2),
        reasoningTokens: BigInt(0),
      },
    ]);

    const { sumUsageWindowStatsByAuthIndex } = await import("@/lib/usage/window-stats");
    await expect(sumUsageWindowStatsByAuthIndex(
      "7",
      new Date("2026-06-01T00:00:00.000Z"),
      new Date("2026-06-01T01:00:00.000Z")
    )).resolves.toEqual({ tokens: 42, cost: 0 });
  });
});
