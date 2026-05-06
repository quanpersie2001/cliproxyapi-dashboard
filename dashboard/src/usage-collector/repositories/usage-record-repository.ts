import type { PrismaClient } from "@/generated/prisma/client";
import type { UsageRecordRepository } from "@/usage-collector/contracts";
import {
  resolveUsageOwnership,
  type UsageOwnershipDirectories,
} from "@/usage-collector/core/ownership-resolver";
import type { NormalizedQueuedUsageEvent } from "@/usage-collector/core/types";
import { invalidateUsageCaches } from "@/lib/cache";
import { prisma as defaultPrisma } from "@/lib/db";

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
    const [apiKeys, oauthOwnerships, keyOwnerships, users] = await Promise.all([
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
      authIndexToFile: new Map(),
      sourceToUser,
      authIndexPrefixToOwner,
      userToApiKey,
    };
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

function normalizeLookupKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizePositiveInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}
