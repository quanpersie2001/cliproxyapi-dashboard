import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { validateOrigin } from "@/lib/auth/origin";
import { Errors, apiSuccess } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  FETCH_TIMEOUT_MS,
  fetchWithTimeout,
  MANAGEMENT_API_KEY,
  MANAGEMENT_BASE_URL,
} from "@/lib/providers/management-api";
import { resolveOAuthAccountAccess } from "@/lib/providers/oauth-account-access";
import { OAUTH_AUTH_FILE_MAX_BYTES } from "@/lib/providers/oauth-auth-file-settings";
import { invalidateProxyModelsCache } from "@/lib/cache";

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
    return Errors.gatewayTimeout("OAuth account settings route");
  }

  if (result.status === 502) {
    return Errors.badGateway("OAuth account settings route", new Error(result.error));
  }

  return Errors.internal("OAuth account settings route", new Error(result.error));
}

export async function GET(
  _request: NextRequest,
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
      return Errors.internal("GET /api/providers/oauth/[id]/settings", new Error("Management API key not configured"));
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
          "Fetch timeout - oauth account settings GET"
        );
        return Errors.gatewayTimeout("GET /api/providers/oauth/[id]/settings");
      }
      throw error;
    }

    if (!response.ok) {
      await response.body?.cancel();
      return Errors.badGateway(
        "GET /api/providers/oauth/[id]/settings",
        new Error(`Upstream returned HTTP ${response.status}`)
      );
    }

    const rawText = await response.text();

    return NextResponse.json({
      fileName: access.account.accountName,
      provider: access.account.provider,
      rawText,
    });
  } catch (error) {
    return Errors.internal("GET /api/providers/oauth/[id]/settings", error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return Errors.unauthorized();
  }

  const originError = validateOrigin(request);
  if (originError) {
    return originError;
  }

  try {
    const { id } = await params;
    const access = await resolveOAuthAccountAccess(session.userId, id);
    if (!access.ok) {
      return toAccessErrorResponse(access);
    }

    if (!MANAGEMENT_API_KEY) {
      return Errors.internal("PATCH /api/providers/oauth/[id]/settings", new Error("Management API key not configured"));
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.fileContent !== "string") {
      return Errors.validation("Request body must include 'fileContent' (string)");
    }

    const normalizedContent = body.fileContent.trim();
    if (!normalizedContent) {
      return Errors.validation("Auth file content cannot be empty");
    }

    if (Buffer.byteLength(normalizedContent, "utf8") > OAUTH_AUTH_FILE_MAX_BYTES) {
      return Errors.validation("Auth file content exceeds the 1MB limit");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(normalizedContent);
    } catch {
      return Errors.validation("Auth file content must be valid JSON");
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Errors.validation("Auth file content must be a JSON object");
    }

    const endpoint = `${MANAGEMENT_BASE_URL}/auth-files`;
    const blob = new Blob([normalizedContent], { type: "application/json" });
    const formData = new FormData();
    formData.append("file", blob, access.account.accountName);

    let response: Response;
    try {
      response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MANAGEMENT_API_KEY}`,
        },
        body: formData,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.error(
          { err: error, endpoint, timeoutMs: FETCH_TIMEOUT_MS },
          "Fetch timeout - oauth account settings PATCH"
        );
        return Errors.gatewayTimeout("PATCH /api/providers/oauth/[id]/settings");
      }
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return Errors.badGateway(
        "PATCH /api/providers/oauth/[id]/settings",
        new Error(`Upstream returned HTTP ${response.status}${errorText ? ` - ${errorText}` : ""}`)
      );
    }

    invalidateProxyModelsCache();

    return apiSuccess({});
  } catch (error) {
    return Errors.internal("PATCH /api/providers/oauth/[id]/settings", error);
  }
}
