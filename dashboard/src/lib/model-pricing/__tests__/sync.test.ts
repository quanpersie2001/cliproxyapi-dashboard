import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {},
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));
import {
  __testables,
  normalizeRequestedSyncSources,
} from "@/lib/model-pricing/sync";

describe("model pricing sync helpers", () => {
  it("parses OpenAI pricing rows from extracted text lines", () => {
    const records = __testables.parseOpenAiPricingFromLines([
      "gpt-5.4$2.50$0.25$15.00$5.00$0.50$22.50",
      "gpt-5.4-mini$0.75$0.075$4.50---",
      "Codex gpt-5.3-codex$1.75$0.175$14.00",
    ]);

    expect(records).toEqual([
      expect.objectContaining({
        provider: "openai",
        model: "gpt-5.4",
        promptPriceUsd: 2.5,
        cachedPriceUsd: 0.25,
        completionPriceUsd: 15,
      }),
      expect.objectContaining({
        provider: "openai",
        model: "gpt-5.4-mini",
        promptPriceUsd: 0.75,
        cachedPriceUsd: 0.075,
        completionPriceUsd: 4.5,
      }),
      expect.objectContaining({
        provider: "codex",
        model: "gpt-5.3-codex",
        promptPriceUsd: 1.75,
        cachedPriceUsd: 0.175,
        completionPriceUsd: 14,
      }),
    ]);
  });

  it("parses Anthropic pricing rows and expands model aliases", () => {
    const records = __testables.parseAnthropicPricingFromLines([
      "Claude Opus 4.6$5 / MTok$6.25 / MTok$10 / MTok$0.50 / MTok$25 / MTok",
      "Claude Sonnet 3.7$3 / MTok$3.75 / MTok$6 / MTok$0.30 / MTok$15 / MTok",
    ]);

    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "claude",
          model: "claude-opus-4-6",
          displayName: "Claude Opus 4.6",
          promptPriceUsd: 5,
          cachedPriceUsd: 0.5,
          completionPriceUsd: 25,
        }),
        expect.objectContaining({
          provider: "claude",
          model: "claude-opus-4.6",
        }),
        expect.objectContaining({
          provider: "claude",
          model: "claude-3-7-sonnet",
          displayName: "Claude Sonnet 3.7",
          promptPriceUsd: 3,
          cachedPriceUsd: 0.3,
          completionPriceUsd: 15,
        }),
      ])
    );
  });

  it("normalizes requested sync sources", () => {
    expect(normalizeRequestedSyncSources(undefined)).toEqual(["openai", "claude"]);
    expect(normalizeRequestedSyncSources(["claude", "openai", "claude", "bogus"])).toEqual([
      "claude",
      "openai",
    ]);
  });
});
