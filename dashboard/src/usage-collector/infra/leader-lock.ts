import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

export interface CollectorLeaderLockRunResult<T> {
  acquired: boolean;
  value?: T;
}

export interface CollectorLeaderLock {
  withLeadership<T>(
    workerId: string,
    run: () => Promise<T>
  ): Promise<CollectorLeaderLockRunResult<T>>;
}

export interface PostgresCollectorLeaderLockOptions {
  prisma?: PrismaClient;
  lockKey?: number;
}

const DEFAULT_LOCK_KEY = 942001;

type AdvisoryLockRow = { acquired: boolean };
type AdvisoryUnlockRow = { released: boolean };

export class PostgresCollectorLeaderLock implements CollectorLeaderLock {
  private readonly prismaClient: PrismaClient;
  private readonly lockKey: number;

  public constructor(options: PostgresCollectorLeaderLockOptions = {}) {
    this.prismaClient = options.prisma ?? defaultPrisma;
    this.lockKey = normalizeLockKey(options.lockKey ?? DEFAULT_LOCK_KEY);
  }

  public async withLeadership<T>(
    _workerId: string,
    run: () => Promise<T>
  ): Promise<CollectorLeaderLockRunResult<T>> {
    const lockRows = await this.prismaClient.$queryRaw<AdvisoryLockRow[]>(
      Prisma.sql`SELECT pg_try_advisory_lock(${this.lockKey}) AS acquired`
    );
    const acquired = lockRows[0]?.acquired === true;
    if (!acquired) {
      return { acquired: false };
    }

    try {
      const value = await run();
      return { acquired: true, value };
    } finally {
      await this.prismaClient.$queryRaw<AdvisoryUnlockRow[]>(
        Prisma.sql`SELECT pg_advisory_unlock(${this.lockKey}) AS released`
      );
    }
  }
}

function normalizeLockKey(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_LOCK_KEY;
  }

  const integer = Math.trunc(value);
  if (integer <= 0) {
    return DEFAULT_LOCK_KEY;
  }

  return integer;
}
