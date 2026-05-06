import { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { validateOrigin } from "@/lib/auth/origin";
import { prisma } from "@/lib/db";
import { Errors, apiSuccess } from "@/lib/errors";
import { ConfirmActionSchema } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

const WEBHOOK_HOST = process.env.WEBHOOK_HOST || "http://localhost:9000";
const DEPLOY_SECRET = process.env.DEPLOY_SECRET || "";

async function isAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  return user?.isAdmin ?? false;
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return Errors.unauthorized();
    }

    const originError = validateOrigin(request);
    if (originError) return originError;

    if (!(await isAdmin(session.userId))) {
      return Errors.forbidden();
    }

    if (!DEPLOY_SECRET) {
      return Errors.internal("Deploy webhook is not configured");
    }

    const body = await request.json().catch(() => ({}));
    const result = ConfirmActionSchema.safeParse(body);

    if (!result.success) {
      return Errors.zodValidation(result.error.issues);
    }

    const response = await fetch(`${WEBHOOK_HOST}/hooks/deploy-dashboard`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Deploy-Token": DEPLOY_SECRET,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error({ status: response.status, response: text }, "Webhook error");
      return Errors.internal("Failed to trigger deployment");
    }

    await response.body?.cancel();

    return apiSuccess({
      message: "Deployment started",
    });
  } catch (error) {
    logger.error({ err: error }, "Deploy error");
    return Errors.internal("Deploy failed");
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return Errors.unauthorized();
    }

    const originError = validateOrigin(request);
    if (originError) return originError;

    if (!(await isAdmin(session.userId))) {
      return Errors.forbidden();
    }

    if (!DEPLOY_SECRET) {
      return apiSuccess({
        webhookConfigured: false,
        status: { status: "idle", message: "Deploy webhook is not configured" },
      });
    }

    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "status";

    const endpoint = type === "log" ? "deploy-log" : "deploy-status";

    const response = await fetch(`${WEBHOOK_HOST}/hooks/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Deploy-Token": DEPLOY_SECRET,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      if (response.status === 404) {
        await response.body?.cancel();
        return apiSuccess({
          webhookConfigured: true,
          status: { status: "idle", message: "No deployment in progress" },
        });
      }
      await response.body?.cancel();
      return Errors.internal("Failed to get deploy status");
    }

    const text = await response.text();

    if (type === "log") {
      return apiSuccess({ webhookConfigured: true, log: text });
    }

    try {
      const status = JSON.parse(text);
      return apiSuccess({ webhookConfigured: true, status });
    } catch {
      return apiSuccess({
        webhookConfigured: true,
        status: { status: "idle", message: "No deployment in progress" },
      });
    }
  } catch (error) {
    logger.error({ err: error }, "Deploy status error");
    return Errors.internal("Failed to get deploy status");
  }
}
