import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/server/db/generated/prisma/client";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    JWT_SECRET: "test-jwt-secret-test-jwt-secret-123456",
    MANAGEMENT_API_KEY: "test-management-api-key-123456",
    CLIPROXYAPI_MANAGEMENT_URL: "http://localhost:8317/v0/management",
    NODE_ENV: "test",
    TZ: "UTC",
    JWT_EXPIRES_IN: "7d",
    CLIPROXYAPI_CONTAINER_NAME: "cliproxyapi",
    LOG_LEVEL: "info",
  },
}));
vi.mock("@/server/db/client", () => ({
  prisma: {},
}));
import {
  ModelPricingCreateSchema,
  serializeModelPricing,
} from "@/lib/model-pricing";
import {
  modelPricingLookupKey,
  modelPricingToLookup,
  resolveModelPriceForUsageKey,
} from "@/features/usage/model-pricing";

describe("model pricing helpers", () => {
  it("applies expected create defaults", () => {
    const parsed = ModelPricingCreateSchema.parse({
      provider: "openai",
      model: "gpt-4.1",
      promptPriceUsd: "1.25",
      completionPriceUsd: 2,
    });

    expect(parsed.currency).toBe("USD");
    expect(parsed.sourceType).toBe("manual");
    expect(parsed.manualOverride).toBe(true);
    expect(parsed.isActive).toBe(true);
  });

  it("serializes prisma decimals to JSON-safe numbers", () => {
    const serialized = serializeModelPricing({
      id: "model_pricing_1",
      provider: "openai",
      model: "gpt-4.1",
      displayName: "GPT-4.1",
      promptPriceUsd: new Prisma.Decimal("1.250000"),
      completionPriceUsd: new Prisma.Decimal("2.500000"),
      cachedPriceUsd: null,
      reasoningPriceUsd: new Prisma.Decimal("0.125000"),
      currency: "USD",
      sourceType: "manual",
      sourceUrl: null,
      manualOverride: true,
      isActive: true,
      effectiveFrom: new Date("2026-04-13T00:00:00.000Z"),
      lastSyncedAt: null,
      syncError: null,
      createdAt: new Date("2026-04-13T00:00:00.000Z"),
      updatedAt: new Date("2026-04-13T01:00:00.000Z"),
    });

    expect(serialized.promptPriceUsd).toBe(1.25);
    expect(serialized.completionPriceUsd).toBe(2.5);
    expect(serialized.reasoningPriceUsd).toBe(0.125);
    expect(serialized.effectiveFrom).toBe("2026-04-13T00:00:00.000Z");
  });

  it("builds lookup by normalized provider:model and keeps reasoning price", () => {
    const lookup = modelPricingToLookup([
      {
        provider: " OpenAI ",
        model: " GPT-4.1 ",
        promptPriceUsd: 2,
        completionPriceUsd: 8,
        cachePriceUsd: 1,
        reasoningPriceUsd: 3,
        isActive: true,
      },
      {
        provider: "Anthropic",
        model: "gPt-4.1",
        promptPriceUsd: 1,
        completionPriceUsd: 4,
        cachePriceUsd: 0.5,
        reasoningPriceUsd: 0,
        isActive: true,
      },
    ]);

    expect(lookup["openai:gpt-4.1"]).toEqual({ prompt: 2, completion: 8, cache: 1, reasoning: 3 });
    expect(lookup["anthropic:gpt-4.1"]).toEqual({ prompt: 1, completion: 4, cache: 0.5, reasoning: 0 });
  });

  it("normalizes provider/model keys for mixed-case usage identities", () => {
    expect(modelPricingLookupKey(" OpenAI ", " GPT-4.1 ")).toBe("openai:gpt-4.1");
  });

  it("falls back to model-only pricing when usage key has no provider", () => {
    const prices = {
      "openai:gpt-5.4": { prompt: 2, completion: 6, cache: 1, reasoning: 0.5 },
      "anthropic:claude-sonnet-4": { prompt: 3, completion: 9, cache: 1.5, reasoning: 0.75 },
    };

    expect(resolveModelPriceForUsageKey(":gpt-5.4", prices)).toEqual(prices["openai:gpt-5.4"]);
  });

  it("does not match pricing from another provider when provider is present", () => {
    const prices = {
      "openai:gpt-5.4": { prompt: 2, completion: 6, cache: 1, reasoning: 0.5 },
    };

    expect(resolveModelPriceForUsageKey("anthropic:gpt-5.4", prices)).toBeNull();
  });
});
