import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  FETCH_TIMEOUT_MS,
  fetchWithTimeout,
  MANAGEMENT_API_KEY,
  MANAGEMENT_BASE_URL,
} from "@/lib/providers/management-api";
import { resolveOAuthAccountAccess } from "@/lib/providers/oauth-account-access";

function toAccessErrorResponse(
  result: Extract<Awaited<ReturnType<typeof resolveOAuthAccountAccess>>, { ok: false }>
) {
  if (result.status === 401) {
    return Errors.unauthorized();
  }

  if (result.status === 403) {
    return Errors.forbidden();
  }

  if (result.status === 404) {
    return Errors.notFound("OAuth account");
  }

  if (result.status === 504) {
    return Errors.gatewayTimeout("GET /api/providers/oauth/[id]/download");
  }

  if (result.status === 502) {
    return Errors.badGateway("GET /api/providers/oauth/[id]/download", new Error(result.error));
  }

  return Errors.internal("GET /api/providers/oauth/[id]/download", new Error(result.error));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return Errors.unauthorized();
  }

  try {
    const { id } = await params;
    const access = await resolveOAuthAccountAccess(session.userId, id);
    if (!access.ok) {
      return toAccessErrorResponse(access);
    }

    if (!MANAGEMENT_API_KEY) {
      return Errors.internal("GET /api/providers/oauth/[id]/download", new Error("Management API key not configured"));
    }

    const endpoint = `${MANAGEMENT_BASE_URL}/auth-files/download?name=${encodeURIComponent(access.account.accountName)}`;

    let response: Response;
    try {
      response = await fetchWithTimeout(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${MANAGEMENT_API_KEY}`,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.error(
          { err: error, endpoint, timeoutMs: FETCH_TIMEOUT_MS },
          "Fetch timeout - oauth account download GET"
        );
        return Errors.gatewayTimeout("GET /api/providers/oauth/[id]/download");
      }
      throw error;
    }

    if (!response.ok) {
      await response.body?.cancel();
      return Errors.badGateway(
        "GET /api/providers/oauth/[id]/download",
        new Error(`Upstream returned HTTP ${response.status}`)
      );
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(access.account.accountName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Errors.internal("GET /api/providers/oauth/[id]/download", error);
  }
}
