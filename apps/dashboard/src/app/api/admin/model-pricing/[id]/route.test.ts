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
const getModelPricingByIdMock = vi.fn();
const findModelPricingByProviderAndModelMock = vi.fn();
const updateModelPricingMock = vi.fn();
const deactivateModelPricingMock = vi.fn();
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

const ModelPricingUpdateSchema = z.object({
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  promptPriceUsd: z.coerce.number().optional(),
  completionPriceUsd: z.coerce.number().optional(),
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
}).refine((value) => Object.values(value).some((entry) => entry !== undefined), {
  message: "At least one field must be provided",
});

vi.mock("@/lib/model-pricing", () => ({
  getModelPricingById: getModelPricingByIdMock,
  findModelPricingByProviderAndModel: findModelPricingByProviderAndModelMock,
  updateModelPricing: updateModelPricingMock,
  deactivateModelPricing: deactivateModelPricingMock,
  ModelPricingUpdateSchema,
}));

vi.mock("@/lib/audit", () => ({
  AUDIT_ACTION: {
    SETTINGS_CHANGED: "SETTINGS_CHANGED",
  },
  extractIpAddress: extractIpAddressMock,
  logAuditAsync: logAuditAsyncMock,
}));

function makeRequest(method: "PUT" | "DELETE", body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/model-pricing/model-1", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("admin model pricing item route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateOriginMock.mockReturnValue(null);
    extractIpAddressMock.mockReturnValue("127.0.0.1");
  });

  it("rejects empty PUT bodies", async () => {
    verifySessionMock.mockResolvedValue({ userId: "admin-1", username: "root" });
    userFindUniqueMock.mockResolvedValue({ isAdmin: true });
    getModelPricingByIdMock.mockResolvedValue({
      id: "model-1",
      provider: "openai",
      model: "gpt-4.1",
      displayName: null,
      promptPriceUsd: 1,
      completionPriceUsd: 2,
      cachedPriceUsd: null,
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

    const { PUT } = await import("./route");
    const response = await PUT(makeRequest("PUT", {}), { params: Promise.resolve({ id: "model-1" }) });

    expect(response.status).toBe(400);
    expect(updateModelPricingMock).not.toHaveBeenCalled();
  });

  it("soft-deletes pricing records and audits the change", async () => {
    verifySessionMock.mockResolvedValue({ userId: "admin-1", username: "root" });
    userFindUniqueMock.mockResolvedValue({ isAdmin: true });
    getModelPricingByIdMock.mockResolvedValue({
      id: "model-1",
      provider: "openai",
      model: "gpt-4.1",
      displayName: null,
      promptPriceUsd: 1,
      completionPriceUsd: 2,
      cachedPriceUsd: null,
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
    deactivateModelPricingMock.mockResolvedValue({
      id: "model-1",
      provider: "openai",
      model: "gpt-4.1",
      displayName: null,
      promptPriceUsd: 1,
      completionPriceUsd: 2,
      cachedPriceUsd: null,
      reasoningPriceUsd: null,
      currency: "USD",
      sourceType: "manual",
      sourceUrl: null,
      manualOverride: true,
      isActive: false,
      effectiveFrom: "2026-04-13T00:00:00.000Z",
      lastSyncedAt: null,
      syncError: null,
      createdAt: "2026-04-13T00:00:00.000Z",
      updatedAt: "2026-04-13T00:00:00.000Z",
    });

    const { DELETE } = await import("./route");
    const response = await DELETE(makeRequest("DELETE"), { params: Promise.resolve({ id: "model-1" }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.modelPricing.isActive).toBe(false);
    expect(logAuditAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin-1",
        action: "SETTINGS_CHANGED",
        target: "openai:gpt-4.1",
      }),
    );
  });
});
