import { describe, expect, it, vi } from "vitest";
import { RespQueueSource, type RespQueueClient } from "@/usage-collector/sources/resp-queue-source";

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
});
