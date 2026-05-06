import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "";
}

export function isModelPreferencesUnavailableError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  const message = getErrorMessage(error).toLowerCase();
  const referencesModelPreferences =
    message.includes("modelpreference") ||
    message.includes("model_preferences");
  const indicatesMissingStorage =
    message.includes("does not exist") ||
    message.includes("doesn't exist") ||
    message.includes("unknown field") ||
    message.includes("unknown arg");

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2021" || error.code === "P2022";
  }

  return referencesModelPreferences && indicatesMissingStorage;
}

export async function loadExcludedModelsForUser(userId: string): Promise<string[]> {
  try {
    const modelPreference = await prisma.modelPreference.findUnique({
      where: { userId },
      select: { excludedModels: true },
    });

    return modelPreference?.excludedModels ?? [];
  } catch (error) {
    if (isModelPreferencesUnavailableError(error)) {
      logger.warn({ userId }, "Model preferences table is unavailable; falling back to all models enabled");
      return [];
    }

    throw error;
  }
}

export async function saveExcludedModelsForUser(
  userId: string,
  excludedModels: string[],
): Promise<{ excludedModels: string[]; persisted: boolean }> {
  try {
    const modelPreference = await prisma.modelPreference.upsert({
      where: { userId },
      create: {
        userId,
        excludedModels,
      },
      update: {
        excludedModels,
      },
      select: { excludedModels: true },
    });

    return {
      excludedModels: modelPreference.excludedModels,
      persisted: true,
    };
  } catch (error) {
    if (isModelPreferencesUnavailableError(error)) {
      logger.warn({ userId }, "Model preferences table is unavailable; skipping persistence");
      return {
        excludedModels,
        persisted: false,
      };
    }

    throw error;
  }
}
