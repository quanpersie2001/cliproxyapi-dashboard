import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { scheduleKeysToCliProxyApiSync } from "@/lib/api-keys/sync";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const session = await verifySession();

    if (!session) {
      return Errors.unauthorized();
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        username: true,
        isAdmin: true,
        createdAt: true,
      },
    });

    if (!user) {
      return Errors.notFound("User");
    }

    scheduleKeysToCliProxyApiSync()
      ?.then((result) => {
        if (!result.ok) {
          logger.warn({ error: result.error }, "Background API key sync failed during auth check");
        }
      })
      .catch((error) => {
        logger.error({ error }, "Background API key sync threw during auth check");
      });

    return NextResponse.json({
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (error) {
    return Errors.internal("Failed to fetch current user", error);
  }
}
