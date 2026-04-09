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

vi.mock("@/lib/db", () => ({
  prisma: {
    providerOAuthOwnership: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code?: string;

      constructor(message: string, options?: { code?: string }) {
        super(message);
        this.code = options?.code;
      }
    },
  },
}));

vi.mock("@/lib/cache", () => ({
  invalidateUsageCaches: vi.fn(),
  invalidateProxyModelsCache: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const fetchMock = vi.fn();
Object.defineProperty(global, "fetch", {
  value: fetchMock,
  writable: true,
  configurable: true,
});

describe("importOAuthCredential", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns the upstream error body instead of throwing when upload fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ files: [] }),
      body: { cancel: vi.fn() },
    });

    const cancel = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve("invalid auth file"),
      body: { cancel },
    });

    const { importOAuthCredential } = await import("@/lib/providers/oauth-ops");

    const result = await importOAuthCredential(
      "user-1",
      "codex",
      "codex-account.json",
      JSON.stringify({ access_token: "token" })
    );

    expect(result).toEqual({
      ok: false,
      error: "Failed to upload credential file: HTTP 400 - invalid auth file",
    });
    expect(cancel).not.toHaveBeenCalled();
  });
});
