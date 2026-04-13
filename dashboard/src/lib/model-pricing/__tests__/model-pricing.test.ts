import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
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
vi.mock("@/lib/db", () => ({
  prisma: {},
}));
import {
  ModelPricingCreateSchema,
  serializeModelPricing,
} from "@/lib/model-pricing";

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
});
