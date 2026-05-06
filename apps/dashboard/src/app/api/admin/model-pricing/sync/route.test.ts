import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
const normalizeRequestedSyncSourcesMock = vi.fn();
const previewModelPricingFromOfficialSourcesMock = vi.fn();
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

vi.mock("@/lib/model-pricing", () => ({
  normalizeRequestedSyncSources: normalizeRequestedSyncSourcesMock,
  previewModelPricingFromOfficialSources: previewModelPricingFromOfficialSourcesMock,
}));

vi.mock("@/lib/audit", () => ({
  AUDIT_ACTION: {
    SETTINGS_CHANGED: "SETTINGS_CHANGED",
  },
  extractIpAddress: extractIpAddressMock,
  logAuditAsync: logAuditAsyncMock,
}));

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/model-pricing/sync", {
    method: "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/admin/model-pricing/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateOriginMock.mockReturnValue(null);
    extractIpAddressMock.mockReturnValue("127.0.0.1");
    normalizeRequestedSyncSourcesMock.mockReturnValue(["openai", "claude"]);
  });

  it("rejects non-admin users", async () => {
    verifySessionMock.mockResolvedValue({ userId: "user-1", username: "alice" });
    userFindUniqueMock.mockResolvedValue({ isAdmin: false });

    const { POST } = await import("./route");
    const response = await POST(makeRequest());

    expect(response.status).toBe(403);
  });

  it("syncs pricing from normalized sources and audits the action", async () => {
    verifySessionMock.mockResolvedValue({ userId: "admin-1", username: "root" });
    userFindUniqueMock.mockResolvedValue({ isAdmin: true });
    previewModelPricingFromOfficialSourcesMock.mockResolvedValue({
      summary: {
        syncedAt: "2026-04-13T12:00:00.000Z",
        sourceCount: 2,
        imported: 12,
        results: [],
      },
      records: [
        {
          provider: "openai",
          model: "gpt-4.1",
          promptPriceUsd: 2,
          completionPriceUsd: 8,
          cachedPriceUsd: 0.5,
        },
      ],
    });

    const { POST } = await import("./route");
    const response = await POST(makeRequest({ sources: ["openai"] }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(normalizeRequestedSyncSourcesMock).toHaveBeenCalledWith(["openai"]);
    expect(previewModelPricingFromOfficialSourcesMock).toHaveBeenCalledWith(["openai", "claude"]);
    expect(payload.summary.imported).toBe(12);
    expect(payload.modelPricing).toHaveLength(1);
    expect(logAuditAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin-1",
        action: "SETTINGS_CHANGED",
        target: "model_pricing_sync",
      })
    );
  });
});
