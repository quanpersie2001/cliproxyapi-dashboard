import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

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
const userFindUniqueMock = vi.fn();
const validateOriginMock = vi.fn();
const listModelPricingMock = vi.fn();
const findModelPricingByProviderAndModelMock = vi.fn();
const createModelPricingMock = vi.fn();
const logAuditAsyncMock = vi.fn();
const extractIpAddressMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  verifySession: verifySessionMock,
}));

vi.mock("@/lib/auth/origin", () => ({
  validateOrigin: validateOriginMock,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: userFindUniqueMock,
    },
  },
}));

const ModelPricingCreateSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  promptPriceUsd: z.coerce.number(),
  completionPriceUsd: z.coerce.number(),
  cachedPriceUsd: z.coerce.number().optional().nullable(),
  reasoningPriceUsd: z.coerce.number().optional().nullable(),
  currency: z.string().optional(),
  sourceType: z.string().optional(),
  sourceUrl: z.string().optional().nullable(),
  manualOverride: z.boolean().optional(),
  isActive: z.boolean().optional(),
  effectiveFrom: z.coerce.date().optional(),
  lastSyncedAt: z.coerce.date().optional().nullable(),
  syncError: z.string().optional().nullable(),
  displayName: z.string().optional().nullable(),
});

vi.mock("@/lib/model-pricing", () => ({
  createModelPricing: createModelPricingMock,
  findModelPricingByProviderAndModel: findModelPricingByProviderAndModelMock,
  listModelPricing: listModelPricingMock,
  ModelPricingCreateSchema,
}));

vi.mock("@/lib/audit", () => ({
  AUDIT_ACTION: {
    SETTINGS_CHANGED: "SETTINGS_CHANGED",
  },
  extractIpAddress: extractIpAddressMock,
  logAuditAsync: logAuditAsyncMock,
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/model-pricing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin model pricing routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateOriginMock.mockReturnValue(null);
    extractIpAddressMock.mockReturnValue("127.0.0.1");
  });

  it("rejects non-admin users", async () => {
    verifySessionMock.mockResolvedValue({ userId: "user-1", username: "alice" });
    userFindUniqueMock.mockResolvedValue({ isAdmin: false });

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(403);
  });

  it("validates POST bodies before writing", async () => {
    verifySessionMock.mockResolvedValue({ userId: "admin-1", username: "root" });
    userFindUniqueMock.mockResolvedValue({ isAdmin: true });

    const { POST } = await import("./route");
    const response = await POST(makeRequest({ provider: "openai" }));

    expect(response.status).toBe(400);
    expect(createModelPricingMock).not.toHaveBeenCalled();
  });

  it("creates pricing and writes an audit record", async () => {
    verifySessionMock.mockResolvedValue({ userId: "admin-1", username: "root" });
    userFindUniqueMock.mockResolvedValue({ isAdmin: true });
    findModelPricingByProviderAndModelMock.mockResolvedValue(null);
    createModelPricingMock.mockResolvedValue({
      id: "pricing-1",
      provider: "openai",
      model: "gpt-4.1",
      displayName: null,
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
    });

    const { POST } = await import("./route");
    const response = await POST(
      makeRequest({
        provider: "openai",
        model: "gpt-4.1",
        promptPriceUsd: "1",
        completionPriceUsd: "2",
        cachedPriceUsd: "0.5",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.modelPricing.provider).toBe("openai");
    expect(logAuditAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin-1",
        action: "SETTINGS_CHANGED",
        target: "openai:gpt-4.1",
      }),
    );
  });
});
