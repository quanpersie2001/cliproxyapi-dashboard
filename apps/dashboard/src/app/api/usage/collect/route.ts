import { randomUUID, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { validateOrigin } from "@/server/auth/lib/origin";
import { verifySession } from "@/server/auth/lib/session";
import { prisma } from "@/server/db/client";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";

const COLLECTOR_API_KEY = process.env.COLLECTOR_API_KEY;
const COLLECTOR_STATE_ID = "singleton";

interface TriggerAuth {
  mode: "bearer" | "admin-session";
}

interface WakeResult {
  wakeSequence: number;
  lastStatus: string;
  queuedAt: string;
  workerId: string | null;
  backoffUntil: string | null;
}

function isCollectorBearerAuth(authHeader: string | null): boolean {
  if (!COLLECTOR_API_KEY || !authHeader) return false;
  const expected = `Bearer ${COLLECTOR_API_KEY}`;
  if (authHeader.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function authorizeTrigger(request: NextRequest): Promise<TriggerAuth | NextResponse> {
  if (isCollectorBearerAuth(request.headers.get("authorization"))) {
    return { mode: "bearer" };
  }

  const session = await verifySession();
  if (!session) {
    return Errors.unauthorized();
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    return Errors.forbidden();
  }

  const originError = validateOrigin(request);
  if (originError) {
    return originError;
  }

  return { mode: "admin-session" };
}

async function requestCollectorWake(trigger: TriggerAuth, runId: string): Promise<WakeResult> {
  const now = new Date();

  await prisma.collectorState.upsert({
    where: { id: COLLECTOR_STATE_ID },
    create: {
      id: COLLECTOR_STATE_ID,
      lastCollectedAt: now,
      lastStatus: "standby",
      recordsStored: 0,
      errorMessage: null,
      wakeSequence: 1,
      wakeRequestedAt: now,
      wakeReason: trigger.mode,
      backoffUntil: null,
    },
    update: {
      wakeSequence: {
        increment: 1,
      },
      wakeRequestedAt: now,
      wakeReason: trigger.mode,
    },
  });

  const state = await prisma.collectorState.findUnique({
    where: { id: COLLECTOR_STATE_ID },
    select: {
      wakeSequence: true,
      lastStatus: true,
      workerId: true,
      backoffUntil: true,
    },
  });

  const wakeSequence = Math.max(1, state?.wakeSequence ?? 1);
  const lastStatus = state?.lastStatus ?? "standby";

  logger.info(
    {
      runId,
      triggerMode: trigger.mode,
      wakeSequence,
      collectorStatus: lastStatus,
      workerId: state?.workerId ?? null,
    },
    "Usage collector wake requested"
  );

  return {
    wakeSequence,
    lastStatus,
    queuedAt: now.toISOString(),
    workerId: state?.workerId ?? null,
    backoffUntil: state?.backoffUntil?.toISOString() ?? null,
  };
}

export async function POST(request: NextRequest) {
  const authResult = await authorizeTrigger(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const runId = randomUUID();

  try {
    const wake = await requestCollectorWake(authResult, runId);
    const accepted = wake.lastStatus === "running";

    return NextResponse.json(
      {
        success: true,
        runId,
        status: accepted ? "accepted" : "queued",
        message: accepted
          ? "Collector is running; wake request accepted"
          : "Collector wake request queued",
        wakeSequence: wake.wakeSequence,
        queuedAt: wake.queuedAt,
        workerId: wake.workerId,
        backoffUntil: wake.backoffUntil,
      },
      { status: accepted ? 202 : 200 }
    );
  } catch (error) {
    logger.error({ err: error, runId }, "Failed to queue usage collector wake request");
    return Errors.internal("Failed to queue usage collection trigger");
  }
}
