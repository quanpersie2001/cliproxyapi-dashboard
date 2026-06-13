import net from "node:net";
import { describe, expect, it, vi } from "vitest";
import { RespQueueSource, type RespQueueClient } from "@/server/jobs/workers/usage-collector/sources/resp-queue-source";

function createClient(overrides: Partial<RespQueueClient> = {}): RespQueueClient {
  return {
    auth: vi.fn().mockResolvedValue(undefined),
    lpop: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("RespQueueSource", () => {
  it("authenticates and maps LPOP messages into transport-neutral envelopes", async () => {
    const client = createClient({
      lpop: vi.fn().mockResolvedValue(['{"ok":1}', '{"ok":2}']),
    });
    const create = vi.fn().mockResolvedValue(client);
    const now = new Date("2026-05-05T12:00:00.000Z");
    const source = new RespQueueSource({
      address: "127.0.0.1:8317",
      queue: "queue",
      password: "secret",
      now: () => now,
      clientFactory: { create },
    });

    const envelopes = await source.pullBatch({ maxMessages: 2 });

    expect(create).toHaveBeenCalledWith({
      address: "127.0.0.1:8317",
      signal: undefined,
    });
    expect(client.auth).toHaveBeenCalledWith("secret");
    expect(client.lpop).toHaveBeenCalledWith("queue", 2);
    expect(client.close).toHaveBeenCalledTimes(1);
    expect(envelopes).toEqual([
      {
        source: "resp_queue",
        receivedAt: now,
        rawMessage: '{"ok":1}',
        sourceMessageId: null,
        metadata: { transport: "resp", queue: "queue" },
      },
      {
        source: "resp_queue",
        receivedAt: now,
        rawMessage: '{"ok":2}',
        sourceMessageId: null,
        metadata: { transport: "resp", queue: "queue" },
      },
    ]);
  });

  it("skips connection setup when maxMessages is zero", async () => {
    const create = vi.fn();
    const source = new RespQueueSource({
      address: "127.0.0.1:8317",
      queue: "queue",
      clientFactory: { create },
    });

    const envelopes = await source.pullBatch({ maxMessages: 0 });

    expect(envelopes).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it("surfaces auth failures and still closes the client", async () => {
    const client = createClient({
      auth: vi.fn().mockRejectedValue(new Error("ERR invalid password")),
    });
    const source = new RespQueueSource({
      address: "127.0.0.1:8317",
      queue: "queue",
      password: "wrong",
      clientFactory: { create: vi.fn().mockResolvedValue(client) },
    });

    await expect(source.pullBatch({ maxMessages: 1 })).rejects.toThrow(
      "ERR invalid password"
    );
    expect(client.lpop).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it("surfaces malformed RESP frames over the real TCP runtime boundary", async () => {
    const runtime = await loadRuntimeRespFactory();
    const { server, address } = await startFakeRespServer((socket) => {
      let commandCount = 0;
      socket.on("data", () => {
        commandCount += 1;
        if (commandCount === 1) {
          socket.write("+OK\r\n");
          return;
        }

        // Malformed bulk string terminator to trigger parser failure.
        socket.write("*1\r\n$5\r\nabcdeX\r\n");
      });
    });

    const source = new RespQueueSource({
      address,
      queue: "queue",
      password: "secret-password-1234",
      clientFactory: runtime.createRespQueueClientFactory(),
    });

    try {
      await expect(source.pullBatch({ maxMessages: 1 })).rejects.toThrow(
        "resp_protocol_error: malformed bulk string"
      );
    } finally {
      await closeServer(server);
    }
  });

  it("parses IPv6 RESP addresses with an explicit safe contract", async () => {
    const runtime = await loadRuntimeRespFactory();

    expect(runtime.splitRespAddressForTests("[2001:db8::10]:6380")).toEqual([
      "2001:db8::10",
      6380,
    ]);
    expect(runtime.splitRespAddressForTests("[2001:db8::10]")).toEqual([
      "2001:db8::10",
      8317,
    ]);
    expect(runtime.splitRespAddressForTests("2001:db8::10")).toEqual([
      "2001:db8::10",
      8317,
    ]);
  });

  it("defaults runtime LPOP to the CLIProxyAPI usage channel", async () => {
    const runtime = await loadRuntimeRespFactory();

    expect(runtime.resolveRespQueueForTests(undefined)).toBe("usage");
    expect(runtime.resolveRespQueueForTests("")).toBe("usage");
    expect(runtime.resolveRespQueueForTests("custom-usage")).toBe("custom-usage");
  });
});

async function startFakeRespServer(
  onConnection: (socket: net.Socket) => void
): Promise<{ server: net.Server; address: string }> {
  const server = net.createServer((socket) => {
    onConnection(socket);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const details = server.address();
  if (!details || typeof details === "string") {
    throw new Error("failed to resolve fake RESP server address");
  }

  return {
    server,
    address: `${details.address}:${details.port}`,
  };
}

async function closeServer(server: net.Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

async function loadRuntimeRespFactory(): Promise<{
  createRespQueueClientFactory: () => {
    create(options: { address: string; signal?: AbortSignal }): Promise<RespQueueClient>;
  };
  splitRespAddressForTests: (address: string) => [string, number];
  resolveRespQueueForTests: (queue: string | undefined) => string;
}> {
  const originalEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    MANAGEMENT_API_KEY: process.env.MANAGEMENT_API_KEY,
    CLIPROXYAPI_MANAGEMENT_URL: process.env.CLIPROXYAPI_MANAGEMENT_URL,
  };

  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/test";
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || "test-secret-with-minimum-32-characters";
  process.env.MANAGEMENT_API_KEY =
    process.env.MANAGEMENT_API_KEY || "test-management-api-key-1234";
  process.env.CLIPROXYAPI_MANAGEMENT_URL =
    process.env.CLIPROXYAPI_MANAGEMENT_URL || "http://127.0.0.1:8317/v0/management";
  await neutralizeServerOnlyModuleForRuntimeImport();

  try {
    return await import("@/server/jobs/workers/usage-collector/runtime-main");
  } finally {
    process.env.DATABASE_URL = originalEnv.DATABASE_URL;
    process.env.JWT_SECRET = originalEnv.JWT_SECRET;
    process.env.MANAGEMENT_API_KEY = originalEnv.MANAGEMENT_API_KEY;
    process.env.CLIPROXYAPI_MANAGEMENT_URL = originalEnv.CLIPROXYAPI_MANAGEMENT_URL;
  }
}

async function neutralizeServerOnlyModuleForRuntimeImport(): Promise<void> {
  try {
    const { createRequire } = await import("node:module");
    const requireFromHere = createRequire(import.meta.url);
    const serverOnlyPath = requireFromHere.resolve("server-only");
    requireFromHere.cache[serverOnlyPath] = {
      id: serverOnlyPath,
      filename: serverOnlyPath,
      loaded: true,
      exports: {},
      children: [],
      paths: [],
    } as unknown as NodeModule;
  } catch {
    // best effort only for environments without server-only
  }
}
