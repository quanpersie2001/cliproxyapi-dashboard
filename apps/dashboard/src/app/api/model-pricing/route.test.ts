import { describe, expect, it, vi, beforeEach } from "vitest";

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

const verifySessionMock = vi.fn();
const listModelPricingMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  verifySession: verifySessionMock,
}));

vi.mock("@/lib/model-pricing", () => ({
  listModelPricing: listModelPricingMock,
}));

describe("GET /api/model-pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unauthorized when no session is present", async () => {
    verifySessionMock.mockResolvedValue(null);

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("returns active pricing for signed-in users", async () => {
    verifySessionMock.mockResolvedValue({ userId: "user-1", username: "alice" });
    listModelPricingMock.mockResolvedValue([
      {
        id: "pricing-1",
        provider: "openai",
        model: "gpt-4.1",
        displayName: "GPT-4.1",
        promptPriceUsd: 1,
        completionPriceUsd: 2,
        cachedPriceUsd: 0.5,
        reasoningPriceUsd: null,
        currency: "USD",
        sourceType: "manual",
        sourceUrl: null,
        manualOverride: true,
        isActive: true,
        effectiveFrom: "2026-04-13T00:00:00.000Z",
        lastSyncedAt: null,
        syncError: null,
        createdAt: "2026-04-13T00:00:00.000Z",
        updatedAt: "2026-04-13T00:00:00.000Z",
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.modelPricing).toHaveLength(1);
    expect(listModelPricingMock).toHaveBeenCalledWith();
  });
});
