import type { PrismaClient } from "../../../../db/generated/prisma/client";
import type { UsageRecordRepository } from "../contracts";
import {
  resolveUsageOwnership,
  type AuthFileOwnershipHint,
  type UsageOwnershipDirectories,
} from "../core/ownership-resolver";
import type { NormalizedQueuedUsageEvent } from "../core/types";
import { invalidateUsageCaches } from "../../../../../lib/cache";
import { prisma as defaultPrisma } from "../../../../db/client";
import { logger } from "../../../../../lib/logger";

export interface UsageRecordRepositoryOptions {
  prisma?: PrismaClient;
  ownershipCacheTtlMs?: number;
}

const DEFAULT_OWNERSHIP_CACHE_TTL_MS = 30_000;

type OwnershipDirectoryCache = {
  directories: UsageOwnershipDirectories;
  refreshedAtMs: number;
};

export class PrismaUsageRecordRepository implements UsageRecordRepository {
  private readonly prismaClient: PrismaClient;
  private readonly ownershipCacheTtlMs: number;
  private ownershipDirectoryCache: OwnershipDirectoryCache | null = null;

  public constructor(options: UsageRecordRepositoryOptions = {}) {
    this.prismaClient = options.prisma ?? defaultPrisma;
    this.ownershipCacheTtlMs = normalizePositiveInt(
      options.ownershipCacheTtlMs ?? DEFAULT_OWNERSHIP_CACHE_TTL_MS
    );
  }

  public async persistNormalizedEvents(events: NormalizedQueuedUsageEvent[]): Promise<number> {
    if (events.length === 0) {
      return 0;
    }

    const deduplicatedEvents = dedupeByEventKey(events);
    const ownershipDirectories = await this.getOwnershipDirectories();

    const result = await this.prismaClient.usageRecord.createMany({
      data: deduplicatedEvents.map((event) => {
        const ownership = resolveUsageOwnership(
          {
            apiGroupKey: event.apiGroupKey,
            apiKey: event.apiKey ?? null,
            authIndex: event.authIndex,
            source: event.source,
          },
          ownershipDirectories
        );

        return {
          userId: ownership.userId,
          apiKeyId: ownership.apiKeyId,
          eventKey: event.eventKey,
          requestId: event.requestId,
          provider: event.provider,
          authType: event.authType,
          authIndex: event.authIndex,
          endpoint: event.apiGroupKey,
          model: event.model,
          source: event.source,
          timestamp: event.timestamp,
          latencyMs: event.latencyMs,
          inputTokens: event.tokens.inputTokens,
          outputTokens: event.tokens.outputTokens,
          reasoningTokens: event.tokens.reasoningTokens,
          cachedTokens: event.tokens.cachedTokens,
          totalTokens: event.tokens.totalTokens,
          failed: event.failed,
        };
      }),
      skipDuplicates: true,
    });

    invalidateUsageCaches();
    return result.count;
  }

  private async getOwnershipDirectories(): Promise<UsageOwnershipDirectories> {
    const now = Date.now();
    const cached = this.ownershipDirectoryCache;
    if (cached && now - cached.refreshedAtMs <= this.ownershipCacheTtlMs) {
      return cached.directories;
    }

    const directories = await this.buildOwnershipDirectories();
    this.ownershipDirectoryCache = {
      directories,
      refreshedAtMs: now,
    };
    return directories;
  }

  private async buildOwnershipDirectories(): Promise<UsageOwnershipDirectories> {
    const [apiKeys, oauthOwnerships, keyOwnerships, users, authIndexToFile] = await Promise.all([
      this.prismaClient.userApiKey.findMany({
        select: {
          id: true,
          userId: true,
          key: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      }),
      this.prismaClient.providerOAuthOwnership.findMany({
        select: {
          userId: true,
          accountName: true,
          accountEmail: true,
        },
      }),
      this.prismaClient.providerKeyOwnership.findMany({
        select: {
          userId: true,
          keyIdentifier: true,
        },
      }),
      this.prismaClient.user.findMany({
        select: {
          id: true,
          username: true,
        },
      }),
      this.loadAuthFilesByIndex(),
    ]);

    const userToApiKey = new Map<string, string>();
    const fullKeyToOwner = new Map<string, { userId: string; apiKeyId: string | null }>();

    for (const apiKey of apiKeys) {
      const normalizedKey = normalizeLookupKey(apiKey.key);
      if (!normalizedKey) {
        continue;
      }
      fullKeyToOwner.set(normalizedKey, {
        userId: apiKey.userId,
        apiKeyId: apiKey.id,
      });

      if (!userToApiKey.has(apiKey.userId)) {
        userToApiKey.set(apiKey.userId, apiKey.id);
      }
    }

    const sourceToUser = new Map<string, string>();
    for (const user of users) {
      const usernameKey = normalizeLookupKey(user.username);
      if (usernameKey) {
        sourceToUser.set(usernameKey, user.id);
      }
    }

    for (const ownership of oauthOwnerships) {
      const accountNameKey = normalizeLookupKey(ownership.accountName);
      if (accountNameKey) {
        sourceToUser.set(accountNameKey, ownership.userId);
      }

      const accountEmailKey = normalizeLookupKey(ownership.accountEmail);
      if (accountEmailKey) {
        sourceToUser.set(accountEmailKey, ownership.userId);
      }
    }

    const authIndexPrefixToOwner = new Map<string, { userId: string; apiKeyId: string | null }>();
    for (const ownership of keyOwnerships) {
      const authPrefix = normalizeLookupKey(ownership.keyIdentifier);
      if (!authPrefix) {
        continue;
      }

      authIndexPrefixToOwner.set(authPrefix, {
        userId: ownership.userId,
        apiKeyId: userToApiKey.get(ownership.userId) ?? null,
      });
    }

    return {
      fullKeyToOwner,
      authIndexToFile,
      sourceToUser,
      authIndexPrefixToOwner,
      userToApiKey,
    };
  }

  private async loadAuthFilesByIndex(): Promise<Map<string, AuthFileOwnershipHint>> {
    const managementApiKey = readLookupString(process.env.MANAGEMENT_API_KEY);
    if (!managementApiKey) {
      return new Map();
    }

    const managementBaseUrl = readLookupString(process.env.CLIPROXYAPI_MANAGEMENT_URL)
      || "http://127.0.0.1:8317/v0/management";

    try {
      const response = await fetch(`${managementBaseUrl}/auth-files`, {
        method: "GET",
        headers: { Authorization: `Bearer ${managementApiKey}` },
      });

      if (!response.ok) {
        await response.body?.cancel();
        logger.warn(
          { status: response.status, statusText: response.statusText },
          "Failed to fetch auth-files during usage ownership resolution"
        );
        return new Map();
      }

      const payload: unknown = await response.json();
      const rawEntries = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { auth_files?: unknown[] })?.auth_files)
          ? (payload as { auth_files: unknown[] }).auth_files
          : Array.isArray((payload as { files?: unknown[] })?.files)
            ? (payload as { files: unknown[] }).files
            : [];

      const authFilesByIndex = new Map<string, AuthFileOwnershipHint>();
      for (const rawEntry of rawEntries) {
        if (!rawEntry || typeof rawEntry !== "object") {
          continue;
        }

        const entry = rawEntry as Record<string, unknown>;
        const authIndex = normalizeLookupKey(entry.auth_index);
        if (!authIndex) {
          continue;
        }

        authFilesByIndex.set(authIndex, {
          fileName: readLookupString(entry.file_name ?? entry.name),
          email: readNullableLookupString(entry.email),
        });
      }

      return authFilesByIndex;
    } catch (error) {
      logger.warn({ err: error }, "Failed to load auth-files for usage ownership resolution");
      return new Map();
    }
  }
}

function dedupeByEventKey(events: NormalizedQueuedUsageEvent[]): NormalizedQueuedUsageEvent[] {
  const seen = new Set<string>();
  const deduplicated: NormalizedQueuedUsageEvent[] = [];

  for (const event of events) {
    if (seen.has(event.eventKey)) {
      continue;
    }
    seen.add(event.eventKey);
    deduplicated.push(event);
  }

  return deduplicated;
}

function normalizeLookupKey(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}

function readLookupString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNullableLookupString(value: unknown): string | null {
  const normalized = readLookupString(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizePositiveInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}
