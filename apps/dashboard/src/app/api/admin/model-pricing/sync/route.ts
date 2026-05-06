import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { validateOrigin } from "@/lib/auth/origin";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION, extractIpAddress, logAuditAsync } from "@/lib/audit";
import { Errors, apiSuccess } from "@/lib/errors";
import {
  normalizeRequestedSyncSources,
  previewModelPricingFromOfficialSources,
} from "@/lib/model-pricing";

async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
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

  return { userId: session.userId };
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const originError = validateOrigin(request);
  if (originError) {
    return originError;
  }

  try {
    const body =
      request.headers.get("content-type")?.includes("application/json")
        ? await request.json().catch(() => ({}))
        : {};
    const sources = normalizeRequestedSyncSources(
      typeof body === "object" && body !== null ? (body as Record<string, unknown>).sources : undefined
    );

    const preview = await previewModelPricingFromOfficialSources(sources);

    logAuditAsync({
      userId: authResult.userId,
      action: AUDIT_ACTION.SETTINGS_CHANGED,
      target: "model_pricing_sync",
      metadata: {
        resource: "model_pricing",
        operation: "sync_preview",
        sources,
        summary: preview.summary,
      },
      ipAddress: extractIpAddress(request),
    });

    return apiSuccess({
      summary: preview.summary,
      modelPricing: preview.records,
    });
  } catch (error) {
    return Errors.internal("POST /api/admin/model-pricing/sync", error);
  }
}
