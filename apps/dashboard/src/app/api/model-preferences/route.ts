import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateOrigin } from "@/lib/auth/origin";
import { verifySession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Errors, apiSuccess } from "@/lib/errors";
import {
  loadExcludedModelsForUser,
  saveExcludedModelsForUser,
} from "@/lib/model-preferences";
import { ModelPreferencesSchema } from "@/lib/validation/schemas";

export async function GET() {
  const session = await verifySession();
  if (!session) {
    return Errors.unauthorized();
  }

  try {
    return NextResponse.json({
      excludedModels: await loadExcludedModelsForUser(session.userId),
    });
  } catch (error) {
    return Errors.internal("GET /api/model-preferences error", error);
  }
}

export async function PUT(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return Errors.unauthorized();
  }

  const originError = validateOrigin(request);
  if (originError) {
    return originError;
  }

  try {
    const body = await request.json();
    const validated = ModelPreferencesSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true },
    });

    if (!user) {
      return Errors.notFound("User");
    }

    const modelPreference = await saveExcludedModelsForUser(
      session.userId,
      validated.excludedModels,
    );

    if (!modelPreference.persisted) {
      return Errors.serviceUnavailable("Model preferences storage is unavailable");
    }

    return apiSuccess({
      excludedModels: modelPreference.excludedModels,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Errors.zodValidation(error.issues);
    }
    return Errors.internal("PUT /api/model-preferences error", error);
  }
}
