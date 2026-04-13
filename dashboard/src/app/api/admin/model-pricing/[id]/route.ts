import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth/session";
import { validateOrigin } from "@/lib/auth/origin";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION, extractIpAddress, logAuditAsync } from "@/lib/audit";
import { Errors, apiSuccess } from "@/lib/errors";
import {
  deactivateModelPricing,
  findModelPricingByProviderAndModel,
  getModelPricingById,
  updateModelPricing,
  ModelPricingUpdateSchema,
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

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const originError = validateOrigin(request);
  if (originError) {
    return originError;
  }

  try {
    const { id } = await context.params;
    const existing = await getModelPricingById(id);
    if (!existing) {
      return Errors.notFound("Model pricing");
    }

    const body = await request.json();
    const validated = ModelPricingUpdateSchema.safeParse(body);
    if (!validated.success) {
      return Errors.zodValidation(validated.error.issues);
    }

    const targetProvider = validated.data.provider ?? existing.provider;
    const targetModel = validated.data.model ?? existing.model;
    const duplicate = await findModelPricingByProviderAndModel(targetProvider, targetModel);
    if (duplicate && duplicate.id !== id) {
      return Errors.conflict("Model pricing already exists for this provider and model");
    }

    const modelPricing = await updateModelPricing(id, validated.data);
    if (!modelPricing) {
      return Errors.notFound("Model pricing");
    }

    logAuditAsync({
      userId: authResult.userId,
      action: AUDIT_ACTION.SETTINGS_CHANGED,
      target: `${modelPricing.provider}:${modelPricing.model}`,
      metadata: {
        resource: "model_pricing",
        operation: "update",
        modelPricingId: modelPricing.id,
      },
      ipAddress: extractIpAddress(request),
    });

    return apiSuccess({ modelPricing });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Errors.zodValidation(error.issues);
    }
    return Errors.internal("PUT /api/admin/model-pricing/[id]", error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const originError = validateOrigin(request);
  if (originError) {
    return originError;
  }

  try {
    const { id } = await context.params;
    const existing = await getModelPricingById(id);
    if (!existing) {
      return Errors.notFound("Model pricing");
    }

    const modelPricing = await deactivateModelPricing(id);
    if (!modelPricing) {
      return Errors.notFound("Model pricing");
    }

    logAuditAsync({
      userId: authResult.userId,
      action: AUDIT_ACTION.SETTINGS_CHANGED,
      target: `${modelPricing.provider}:${modelPricing.model}`,
      metadata: {
        resource: "model_pricing",
        operation: "delete",
        modelPricingId: modelPricing.id,
      },
      ipAddress: extractIpAddress(request),
    });

    return apiSuccess({ modelPricing });
  } catch (error) {
    return Errors.internal("DELETE /api/admin/model-pricing/[id]", error);
  }
}
