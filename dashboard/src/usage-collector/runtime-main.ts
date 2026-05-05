import net from "node:net";
import { env } from "@/lib/env";
import { CLIProxyV1Decoder } from "@/usage-collector/decoders/cliproxy-v1-decoder";
import { PostgresCollectorLeaderLock } from "@/usage-collector/infra/leader-lock";
import { OneShotCollectorOrchestrator } from "@/usage-collector/core/one-shot-orchestrator";
import { CollectorProcessService } from "@/usage-collector/core/process-service";
import { CollectorPullService } from "@/usage-collector/core/pull-service";
import { PrismaCollectorStateRepository } from "@/usage-collector/repositories/collector-state-repository";
import { PrismaUsageQueueInboxRepository } from "@/usage-collector/repositories/inbox-repository";
import { PrismaUsageRecordRepository } from "@/usage-collector/repositories/usage-record-repository";
import { UsageCollectorWorkerRunner, type CollectorRunSignal } from "@/usage-collector/runner";
import {
  RespQueueSource,
  type RespQueueClient,
  type RespQueueClientFactory,
} from "@/usage-collector/sources/resp-queue-source";

type RuntimeLogger = Pick<typeof console, "info" | "warn" | "error">;

interface RunCollectorRuntimeOptions {
  signal?: CollectorRunSignal;
  logger?: RuntimeLogger;
}

type RespSimpleError = {
  kind: "error";
  message: string;
};

type RespValue = string | number | null | RespValue[] | RespSimpleError;

const DEFAULT_RESP_PORT = 8317;
const DEFAULT_RESP_QUEUE = "queue";
const SOCKET_TIMEOUT_MS = 10_000;

export async function runCollectorRuntime(
  options: RunCollectorRuntimeOptions = {}
): Promise<void> {
  const logger = options.logger ?? console;
  const signal = options.signal ?? { aborted: false };

  const respAddress = resolveRespAddress(process.env.USAGE_RESP_ADDR, env.CLIPROXYAPI_MANAGEMENT_URL);
  const respQueue = normalizeText(process.env.USAGE_RESP_QUEUE) || DEFAULT_RESP_QUEUE;
  const respPassword = normalizeOptionalText(process.env.USAGE_RESP_PASSWORD) ?? env.MANAGEMENT_API_KEY;
  const workerId = normalizeText(process.env.USAGE_COLLECTOR_WORKER_ID) || `worker-${process.pid}`;

  const source = new RespQueueSource({
    address: respAddress,
    queue: respQueue,
    password: respPassword,
    clientFactory: createRespQueueClientFactory(),
  });
  const inboxRepository = new PrismaUsageQueueInboxRepository();
  const usageRecordRepository = new PrismaUsageRecordRepository();
  const decoder = new CLIProxyV1Decoder();

  const orchestrator = new OneShotCollectorOrchestrator({
    pullService: new CollectorPullService({
      source,
      inboxRepository,
    }),
    processService: new CollectorProcessService({
      decoder,
      inboxRepository,
      usageRecordRepository,
    }),
  });

  const runner = new UsageCollectorWorkerRunner({
    workerId,
    orchestrator,
    lock: new PostgresCollectorLeaderLock({
      lockKey: env.USAGE_COLLECTOR_LEADER_LOCK_KEY,
    }),
    stateRepository: new PrismaCollectorStateRepository(),
    enabled: env.USAGE_COLLECTOR_ENABLED,
    pullBatchSize: env.USAGE_COLLECTOR_PULL_BATCH_SIZE,
    processBatchSize: env.USAGE_COLLECTOR_PROCESS_BATCH_SIZE,
    idleMs: env.USAGE_COLLECTOR_IDLE_MS,
    errorBackoffMs: env.USAGE_COLLECTOR_ERROR_BACKOFF_MS,
    sleep: interruptibleSleep,
  });

  logger.info(
    `[usage-collector] worker runtime started (workerId=${workerId} enabled=${env.USAGE_COLLECTOR_ENABLED} resp=${respAddress}/${respQueue})`
  );
  try {
    await runner.start(signal);
    logger.info("[usage-collector] worker runtime stopped");
  } catch (error) {
    logger.error({
      err: error,
      workerId,
      respAddress,
      respQueue,
    }, "[usage-collector] worker runtime exited with error");
    throw error;
  }
}

export function createRespQueueClientFactory(): RespQueueClientFactory {
  return {
    async create({ address, signal }) {
      const socket = await connectRespSocket(address, signal);
      return new TcpRespQueueClient(socket);
    },
  };
}

class TcpRespQueueClient implements RespQueueClient {
  private readonly reader: RespSocketReader;

  public constructor(private readonly socket: net.Socket) {
    this.reader = new RespSocketReader(socket);
  }

  public async auth(password: string): Promise<void> {
    if (!password.trim()) {
      return;
    }

    const response = await this.sendCommand(["AUTH", password]);
    assertSimpleString(response, "OK");
  }

  public async lpop(queue: string, count: number): Promise<string[]> {
    const normalizedCount = Math.max(0, Math.trunc(count));
    if (normalizedCount === 0) {
      return [];
    }

    const response = await this.sendCommand(["LPOP", queue, String(normalizedCount)]);
    if (response === null) {
      return [];
    }
    if (!Array.isArray(response)) {
      throw new Error(`resp_protocol_error: expected array, got ${typeof response}`);
    }

    const messages: string[] = [];
    for (const item of response) {
      if (item === null) {
        continue;
      }
      if (typeof item !== "string") {
        throw new Error("resp_protocol_error: non-string message from LPOP");
      }
      messages.push(item);
    }
    return messages;
  }

  public async close(): Promise<void> {
    if (this.socket.destroyed) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.socket.once("close", () => resolve());
      this.socket.end();
      setTimeout(() => {
        if (!this.socket.destroyed) {
          this.socket.destroy();
        }
        resolve();
      }, 250).unref();
    });
  }

  private async sendCommand(parts: string[]): Promise<RespValue> {
    const payload = encodeRespArray(parts);

    await new Promise<void>((resolve, reject) => {
      this.socket.write(payload, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    const value = await this.reader.read();
    if (isRespError(value)) {
      throw new Error(value.message);
    }
    return value;
  }
}

class RespSocketReader {
  private buffer = Buffer.alloc(0);
  private readonly waiters: Array<{ resolve: (value: RespValue) => void; reject: (error: Error) => void }> =
    [];
  private terminalError: Error | null = null;

  public constructor(private readonly socket: net.Socket) {
    socket.on("data", (chunk: Buffer) => {
      try {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this.flush();
      } catch (error) {
        this.fail(toRuntimeError(error));
      }
    });

    socket.on("error", (error) => {
      this.fail(error);
    });

    socket.on("close", () => {
      if (!this.terminalError) {
        this.fail(new Error("resp_socket_closed"));
      }
    });
  }

  public read(): Promise<RespValue> {
    if (this.terminalError) {
      return Promise.reject(this.terminalError);
    }

    let parsed: ParseResult | null;
    try {
      parsed = tryParseRespValue(this.buffer, 0);
    } catch (error) {
      const runtimeError = toRuntimeError(error);
      this.fail(runtimeError);
      return Promise.reject(runtimeError);
    }
    if (parsed) {
      this.buffer = this.buffer.subarray(parsed.next);
      return Promise.resolve(parsed.value);
    }

    return new Promise<RespValue>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  private flush(): void {
    while (this.waiters.length > 0) {
      let parsed: ParseResult | null;
      try {
        parsed = tryParseRespValue(this.buffer, 0);
      } catch (error) {
        this.fail(toRuntimeError(error));
        return;
      }
      if (!parsed) {
        return;
      }

      this.buffer = this.buffer.subarray(parsed.next);
      const waiter = this.waiters.shift();
      if (!waiter) {
        return;
      }
      waiter.resolve(parsed.value);
    }
  }

  private fail(error: Error): void {
    if (this.terminalError) {
      return;
    }
    this.terminalError = error;
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (!waiter) {
        return;
      }
      waiter.reject(error);
    }
  }
}

type ParseResult = {
  value: RespValue;
  next: number;
};

function tryParseRespValue(buffer: Buffer, offset: number): ParseResult | null {
  if (offset >= buffer.length) {
    return null;
  }

  const prefix = String.fromCharCode(buffer[offset]);
  if (prefix === "+" || prefix === "-" || prefix === ":" || prefix === "$" || prefix === "*") {
    return parseRespValue(buffer, offset, prefix);
  }

  throw new Error(`resp_protocol_error: unknown prefix ${prefix}`);
}

function parseRespValue(buffer: Buffer, offset: number, prefix: string): ParseResult | null {
  const line = readRespLine(buffer, offset + 1);
  if (!line) {
    return null;
  }

  const { text, next } = line;

  if (prefix === "+") {
    return {
      value: text,
      next,
    };
  }

  if (prefix === "-") {
    return {
      value: {
        kind: "error",
        message: text || "resp_error",
      },
      next,
    };
  }

  if (prefix === ":") {
    return {
      value: Number.parseInt(text, 10),
      next,
    };
  }

  if (prefix === "$") {
    const byteLength = Number.parseInt(text, 10);
    if (byteLength === -1) {
      return {
        value: null,
        next,
      };
    }

    const end = next + byteLength;
    if (end + 2 > buffer.length) {
      return null;
    }

    if (buffer[end] !== 13 || buffer[end + 1] !== 10) {
      throw new Error("resp_protocol_error: malformed bulk string");
    }

    return {
      value: buffer.subarray(next, end).toString("utf8"),
      next: end + 2,
    };
  }

  const count = Number.parseInt(text, 10);
  if (count === -1) {
    return {
      value: null,
      next,
    };
  }

  const values: RespValue[] = [];
  let currentOffset = next;
  for (let i = 0; i < count; i += 1) {
    const parsed = tryParseRespValue(buffer, currentOffset);
    if (!parsed) {
      return null;
    }
    values.push(parsed.value);
    currentOffset = parsed.next;
  }

  return {
    value: values,
    next: currentOffset,
  };
}

function readRespLine(
  buffer: Buffer,
  offset: number
): {
  text: string;
  next: number;
} | null {
  for (let index = offset; index < buffer.length - 1; index += 1) {
    if (buffer[index] === 13 && buffer[index + 1] === 10) {
      return {
        text: buffer.subarray(offset, index).toString("utf8"),
        next: index + 2,
      };
    }
  }

  return null;
}

function encodeRespArray(parts: string[]): Buffer {
  const chunks: string[] = [`*${parts.length}\r\n`];
  for (const part of parts) {
    const value = part ?? "";
    chunks.push(`$${Buffer.byteLength(value)}\r\n${value}\r\n`);
  }
  return Buffer.from(chunks.join(""), "utf8");
}

function assertSimpleString(value: RespValue, expected: string): void {
  if (value !== expected) {
    throw new Error(`resp_protocol_error: expected ${expected}, got ${String(value)}`);
  }
}

function isRespError(value: RespValue): value is RespSimpleError {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "error";
}

async function connectRespSocket(
  address: string,
  signal?: AbortSignal
): Promise<net.Socket> {
  const [host, port] = splitAddress(address);

  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    socket.setNoDelay(true);
    socket.setTimeout(SOCKET_TIMEOUT_MS);

    const handleAbort = () => {
      socket.destroy(new Error("resp_connection_aborted"));
    };

    if (signal?.aborted) {
      handleAbort();
      reject(new Error("resp_connection_aborted"));
      return;
    }

    const cleanup = () => {
      socket.removeListener("error", onError);
      socket.removeListener("timeout", onTimeout);
      socket.removeListener("connect", onConnect);
      signal?.removeEventListener("abort", handleAbort);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onTimeout = () => {
      cleanup();
      socket.destroy();
      reject(new Error("resp_connection_timeout"));
    };

    const onConnect = () => {
      cleanup();
      resolve(socket);
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
    socket.once("connect", onConnect);
  });
}

function splitAddress(address: string): [string, number] {
  const trimmed = address.trim();
  if (!trimmed) {
    return ["127.0.0.1", DEFAULT_RESP_PORT];
  }

  const separator = trimmed.lastIndexOf(":");
  if (separator <= 0 || separator === trimmed.length - 1) {
    return [trimmed, DEFAULT_RESP_PORT];
  }

  const host = trimmed.slice(0, separator).trim();
  const parsedPort = Number.parseInt(trimmed.slice(separator + 1), 10);
  if (!Number.isFinite(parsedPort) || parsedPort <= 0) {
    return [host || "127.0.0.1", DEFAULT_RESP_PORT];
  }

  return [host || "127.0.0.1", parsedPort];
}

function resolveRespAddress(explicitAddress: string | undefined, managementUrl: string): string {
  const explicit = normalizeText(explicitAddress);
  if (explicit) {
    return explicit;
  }

  try {
    const parsed = new URL(managementUrl);
    const host = parsed.hostname || "127.0.0.1";
    const port = parsed.port ? Number.parseInt(parsed.port, 10) : DEFAULT_RESP_PORT;
    if (!Number.isFinite(port) || port <= 0) {
      return `${host}:${DEFAULT_RESP_PORT}`;
    }
    return `${host}:${port}`;
  } catch {
    return `127.0.0.1:${DEFAULT_RESP_PORT}`;
  }
}

async function interruptibleSleep(ms: number, signal: CollectorRunSignal): Promise<void> {
  let remaining = Math.max(0, Math.trunc(ms));
  while (remaining > 0 && !signal.aborted) {
    const chunk = Math.min(remaining, 250);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, chunk);
    });
    remaining -= chunk;
  }
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim();
}

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = normalizeText(value);
  return normalized ? normalized : null;
}

function toRuntimeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
