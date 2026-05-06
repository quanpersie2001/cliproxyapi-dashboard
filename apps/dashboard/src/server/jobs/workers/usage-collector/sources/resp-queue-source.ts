import type { UsageMessageSource } from "../contracts";
import type { PullOnceOptions } from "../core/orchestrator";
import type { UsageSourceEnvelope } from "../core/types";

export interface RespQueueClient {
  auth(password: string): Promise<void>;
  lpop(queue: string, count: number): Promise<string[]>;
  close(): Promise<void>;
}

export interface RespQueueClientFactory {
  create(options: { address: string; signal?: AbortSignal }): Promise<RespQueueClient>;
}

export interface RespQueueSourceOptions {
  address: string;
  queue: string;
  password?: string | null;
  sourceName?: string;
  now?: () => Date;
  clientFactory: RespQueueClientFactory;
}

export class RespQueueSource implements UsageMessageSource {
  private readonly now: () => Date;
  private readonly sourceName: string;
  private readonly password: string;

  public constructor(private readonly options: RespQueueSourceOptions) {
    this.now = options.now ?? (() => new Date());
    this.sourceName = (options.sourceName ?? "resp_queue").trim() || "resp_queue";
    this.password = (options.password ?? "").trim();
  }

  public async pullBatch(pullOptions: PullOnceOptions): Promise<UsageSourceEnvelope[]> {
    const maxMessages = normalizePositiveInt(pullOptions.maxMessages);
    if (maxMessages === 0) {
      return [];
    }

    const client = await this.options.clientFactory.create({
      address: this.options.address,
      signal: pullOptions.signal,
    });

    try {
      if (this.password.length > 0) {
        await client.auth(this.password);
      }

      const rawMessages = await client.lpop(this.options.queue, maxMessages);
      const receivedAt = this.now();

      return rawMessages.map((rawMessage) => ({
        source: this.sourceName,
        receivedAt,
        rawMessage,
        sourceMessageId: null,
        metadata: {
          transport: "resp",
          queue: this.options.queue,
        },
      }));
    } finally {
      await closeQuietly(client);
    }
  }
}

function normalizePositiveInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

async function closeQuietly(client: RespQueueClient): Promise<void> {
  try {
    await client.close();
  } catch {
    // Ignore close errors; command errors are surfaced from pullBatch.
  }
}
