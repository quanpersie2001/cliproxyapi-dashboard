import type { PrismaClient } from "@/generated/prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

const COLLECTOR_STATE_ID = "singleton";

export interface CollectorStateRepository {
  ensureSingletonState(): Promise<void>;
  getWakeSequence(): Promise<number>;
  markStandby(workerId: string): Promise<void>;
  markRunning(workerId: string): Promise<void>;
  markSuccess(workerId: string, recordsStored: number): Promise<void>;
  markError(workerId: string, errorMessage: string): Promise<void>;
  markWakeHandled(workerId: string, wakeSequence: number): Promise<void>;
}

export interface CollectorStateRepositoryOptions {
  prisma?: PrismaClient;
  now?: () => Date;
}

export class PrismaCollectorStateRepository implements CollectorStateRepository {
  private readonly prismaClient: PrismaClient;
  private readonly now: () => Date;

  public constructor(options: CollectorStateRepositoryOptions = {}) {
    this.prismaClient = options.prisma ?? defaultPrisma;
    this.now = options.now ?? (() => new Date());
  }

  public async ensureSingletonState(): Promise<void> {
    await this.prismaClient.collectorState.upsert({
      where: { id: COLLECTOR_STATE_ID },
      create: {
        id: COLLECTOR_STATE_ID,
        lastCollectedAt: this.now(),
        lastStatus: "standby",
        recordsStored: 0,
        errorMessage: null,
      },
      update: {},
    });
  }

  public async getWakeSequence(): Promise<number> {
    const state = await this.prismaClient.collectorState.findUnique({
      where: { id: COLLECTOR_STATE_ID },
      select: { wakeSequence: true },
    });
    return normalizeNonNegativeInt(state?.wakeSequence ?? 0);
  }

  public async markStandby(workerId: string): Promise<void> {
    await this.prismaClient.collectorState.update({
      where: { id: COLLECTOR_STATE_ID },
      data: {
        lastStatus: "standby",
        workerId,
        heartbeatAt: this.now(),
      },
    });
  }

  public async markRunning(workerId: string): Promise<void> {
    await this.prismaClient.collectorState.update({
      where: { id: COLLECTOR_STATE_ID },
      data: {
        lastStatus: "running",
        workerId,
        heartbeatAt: this.now(),
        lastRunStartedAt: this.now(),
        errorMessage: null,
      },
    });
  }

  public async markSuccess(workerId: string, recordsStored: number): Promise<void> {
    await this.prismaClient.collectorState.update({
      where: { id: COLLECTOR_STATE_ID },
      data: {
        lastStatus: "success",
        workerId,
        recordsStored: normalizeNonNegativeInt(recordsStored),
        errorMessage: null,
        heartbeatAt: this.now(),
        lastCollectedAt: this.now(),
        lastRunFinishedAt: this.now(),
        backoffUntil: null,
      },
    });
  }

  public async markError(workerId: string, errorMessage: string): Promise<void> {
    await this.prismaClient.collectorState.update({
      where: { id: COLLECTOR_STATE_ID },
      data: {
        lastStatus: "error",
        workerId,
        errorMessage,
        heartbeatAt: this.now(),
        lastRunFinishedAt: this.now(),
      },
    });
  }

  public async markWakeHandled(workerId: string, wakeSequence: number): Promise<void> {
    await this.prismaClient.collectorState.update({
      where: { id: COLLECTOR_STATE_ID },
      data: {
        workerId,
        lastWakeHandledAt: this.now(),
        wakeSequence: normalizeNonNegativeInt(wakeSequence),
      },
    });
  }
}

function normalizeNonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}
