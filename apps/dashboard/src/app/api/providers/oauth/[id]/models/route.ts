import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  FETCH_TIMEOUT_MS,
  fetchWithTimeout,
  isRecord,
  MANAGEMENT_API_KEY,
  MANAGEMENT_BASE_URL,
} from "@/lib/providers/management-api";
import { resolveOAuthAccountAccess } from "@/lib/providers/oauth-account-access";

interface ModelItem {
  id: string;
  display_name?: string;
  type?: string;
  owned_by?: string;
}

function normalizeModels(payload: unknown): ModelItem[] {
  if (!isRecord(payload)) {
    return [];
  }

  const rawModels = Array.isArray(payload.models)
    ? payload.models
    : Array.isArray(payload.data)
      ? payload.data
      : [];

  return rawModels.reduce<ModelItem[]>((result, entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id.trim()) {
      return result;
    }

    result.push({
      id: entry.id.trim(),
      ...(typeof entry.display_name === "string" && entry.display_name.trim()
        ? { display_name: entry.display_name.trim() }
        : {}),
      ...(typeof entry.type === "string" && entry.type.trim()
        ? { type: entry.type.trim() }
        : {}),
      ...(typeof entry.owned_by === "string" && entry.owned_by.trim()
        ? { owned_by: entry.owned_by.trim() }
        : {}),
    });
    return result;
  }, []);
}

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
    return Errors.gatewayTimeout("GET /api/providers/oauth/[id]/models");
  }

  if (result.status === 502) {
    return Errors.badGateway("GET /api/providers/oauth/[id]/models", new Error(result.error));
  }

  return Errors.internal("GET /api/providers/oauth/[id]/models", new Error(result.error));
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
      return Errors.internal("GET /api/providers/oauth/[id]/models", new Error("Management API key not configured"));
    }

    const endpoint = `${MANAGEMENT_BASE_URL}/auth-files/models?name=${encodeURIComponent(access.account.accountName)}`;

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
          "Fetch timeout - oauth account models GET"
        );
        return Errors.gatewayTimeout("GET /api/providers/oauth/[id]/models");
      }
      throw error;
    }

    if (!response.ok) {
      await response.body?.cancel();
      return Errors.badGateway(
        "GET /api/providers/oauth/[id]/models",
        new Error(`Upstream returned HTTP ${response.status}`)
      );
    }

    const payload = await response.json();
    return NextResponse.json({ models: normalizeModels(payload) });
  } catch (error) {
    return Errors.internal("GET /api/providers/oauth/[id]/models", error);
  }
}
