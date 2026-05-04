import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    JWT_SECRET: "12345678901234567890123456789012",
    MANAGEMENT_API_KEY: "1234567890123456",
    CLIPROXYAPI_MANAGEMENT_URL: "http://test:8317/v0/management",
    NODE_ENV: "test",
    TZ: "UTC",
    JWT_EXPIRES_IN: "7d",
    CLIPROXYAPI_CONTAINER_NAME: "cliproxyapi",
    LOG_LEVEL: "info",
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const verifySessionMock = vi.fn();
const listOAuthWithOwnershipMock = vi.fn();
const contributeOAuthAccountMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  verifySession: verifySessionMock,
}));
vi.mock("@/lib/auth/origin", () => ({
  validateOrigin: vi.fn(() => null),
}));
vi.mock("@/lib/auth/rate-limit", () => ({
  checkRateLimitWithPreset: vi.fn(() => ({ allowed: true })),
}));

vi.mock("@/lib/providers/dual-write", () => ({
  listOAuthWithOwnership: listOAuthWithOwnershipMock,
  contributeOAuthAccount: contributeOAuthAccountMock,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: findUniqueMock,
    },
  },
}));

describe("GET /api/providers/oauth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifySessionMock.mockResolvedValue({ userId: "user-1" });
    findUniqueMock.mockResolvedValue({ isAdmin: true });
    listOAuthWithOwnershipMock.mockResolvedValue({
      ok: true,
      accounts: [{ id: "auth-file-1", accountName: "one" }],
    });
  });

  it("loads OAuth accounts with ownership from the primary list endpoint", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost/api/providers/oauth?maskedProxyFor=one&maskedProxyFor=two&maskedProxyFor=one"
    );

    const response = await GET(request);
    const body = await response.json();

    expect(listOAuthWithOwnershipMock).toHaveBeenCalledWith("user-1", true);
    expect(body).toEqual({
      accounts: [{ id: "auth-file-1", accountName: "one" }],
    });
  });
});
