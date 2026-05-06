import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  verifySessionMock,
  validateOriginMock,
  prismaMock,
  loggerMock,
} = vi.hoisted(() => ({
  verifySessionMock: vi.fn(),
  validateOriginMock: vi.fn(),
  prismaMock: {
    user: {
      findUnique: vi.fn(),
    },
    collectorState: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/server/auth/lib/session", () => ({
  verifySession: verifySessionMock,
}));

vi.mock("@/server/auth/lib/origin", () => ({
  validateOrigin: validateOriginMock,
}));

vi.mock("@/server/db/client", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: loggerMock,
}));

async function loadPostHandler() {
  vi.resetModules();
  process.env.COLLECTOR_API_KEY = "collector-secret";
  const routeModule = await import("./route");
  return routeModule.POST;
}

function createRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/usage/collect", {
    method: "POST",
    headers,
  });
}

describe("POST /api/usage/collect", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    verifySessionMock.mockResolvedValue(null);
    validateOriginMock.mockReturnValue(null);

    prismaMock.user.findUnique.mockResolvedValue({ isAdmin: true });
    prismaMock.collectorState.upsert.mockResolvedValue(undefined);
    prismaMock.collectorState.findUnique.mockResolvedValue({
      wakeSequence: 2,
      lastStatus: "standby",
      workerId: "worker-a",
      backoffUntil: null,
    });
  });

  it("queues a fast wake trigger via bearer auth and does not perform legacy fetch", async () => {
    const POST = await loadPostHandler();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      createRequest({
        authorization: "Bearer collector-secret",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      status: "queued",
      wakeSequence: 2,
    });
    expect(verifySessionMock).not.toHaveBeenCalled();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.collectorState.upsert).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("returns 202 when collector is already running", async () => {
    const POST = await loadPostHandler();
    prismaMock.collectorState.findUnique.mockResolvedValue({
      wakeSequence: 9,
      lastStatus: "running",
      workerId: "worker-a",
      backoffUntil: null,
    });

    const response = await POST(
      createRequest({
        authorization: "Bearer collector-secret",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({
      success: true,
      status: "accepted",
      wakeSequence: 9,
    });
  });

  it("keeps admin-session + origin auth path", async () => {
    const POST = await loadPostHandler();
    verifySessionMock.mockResolvedValue({ userId: "admin-1" });
    prismaMock.user.findUnique.mockResolvedValue({ isAdmin: true });

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(verifySessionMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      select: { isAdmin: true },
    });
    expect(validateOriginMock).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when session is missing and bearer auth is absent", async () => {
    const POST = await loadPostHandler();
    verifySessionMock.mockResolvedValue(null);

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    const POST = await loadPostHandler();
    verifySessionMock.mockResolvedValue({ userId: "user-1" });
    prismaMock.user.findUnique.mockResolvedValue({ isAdmin: false });

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
  });

  it("returns origin validation failure response for admin session requests", async () => {
    const POST = await loadPostHandler();
    verifySessionMock.mockResolvedValue({ userId: "admin-1" });
    validateOriginMock.mockReturnValue(
      NextResponse.json({ error: "origin" }, { status: 403 })
    );

    const response = await POST(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: "origin" });
  });
});
