import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth/session";
import { validateOrigin } from "@/lib/auth/origin";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION, extractIpAddress, logAuditAsync } from "@/lib/audit";
import { Errors, apiSuccess } from "@/lib/errors";
import {
  createModelPricing,
  findModelPricingByProviderAndModel,
  listModelPricing,
  ModelPricingCreateSchema,
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

export async function GET() {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const modelPricing = await listModelPricing({ includeInactive: true });
    return apiSuccess({ modelPricing });
  } catch (error) {
    return Errors.internal("GET /api/admin/model-pricing", error);
  }
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
    const body = await request.json();
    const validated = ModelPricingCreateSchema.safeParse(body);

    if (!validated.success) {
      return Errors.zodValidation(validated.error.issues);
    }

    const duplicate = await findModelPricingByProviderAndModel(
      validated.data.provider,
      validated.data.model,
    );

    if (duplicate) {
      return Errors.conflict("Model pricing already exists for this provider and model");
    }

    const modelPricing = await createModelPricing(validated.data);

    logAuditAsync({
      userId: authResult.userId,
      action: AUDIT_ACTION.SETTINGS_CHANGED,
      target: `${modelPricing.provider}:${modelPricing.model}`,
      metadata: {
        resource: "model_pricing",
        operation: "create",
        modelPricingId: modelPricing.id,
      },
      ipAddress: extractIpAddress(request),
    });

    return apiSuccess({ modelPricing }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Errors.zodValidation(error.issues);
    }
    return Errors.internal("POST /api/admin/model-pricing", error);
  }
}
