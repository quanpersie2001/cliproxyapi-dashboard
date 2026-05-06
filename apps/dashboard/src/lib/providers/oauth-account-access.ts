import "server-only";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  FETCH_TIMEOUT_MS,
  fetchWithTimeout,
  isRecord,
  MANAGEMENT_API_KEY,
  MANAGEMENT_BASE_URL,
} from "@/lib/providers/management-api";

export interface ResolvedOAuthAccountAccess {
  accountName: string;
  accountEmail: string | null;
  provider: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  ownershipId: string | null;
}

export type OAuthAccountAccessResult =
  | { ok: true; account: ResolvedOAuthAccountAccess }
  | {
      ok: false;
      status: 401 | 403 | 404 | 500 | 502 | 504;
      error: string;
    };

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function resolveOAuthAccountAccess(
  userId: string,
  accountName: string
): Promise<OAuthAccountAccessResult> {
  const normalizedAccountName = accountName.trim();

  if (!normalizedAccountName) {
    return {
      ok: false,
      status: 404,
      error: "OAuth account not found",
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  if (!user) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    };
  }

  const ownership = await prisma.providerOAuthOwnership.findUnique({
    where: { accountName: normalizedAccountName },
    select: {
      id: true,
      userId: true,
      provider: true,
      accountName: true,
      accountEmail: true,
    },
  });

  if (ownership) {
    if (!user.isAdmin && ownership.userId !== userId) {
      return {
        ok: false,
        status: 403,
        error: "Forbidden",
      };
    }

    return {
      ok: true,
      account: {
        accountName: ownership.accountName,
        accountEmail: ownership.accountEmail,
        provider: ownership.provider,
        isAdmin: user.isAdmin,
        isOwner: ownership.userId === userId,
        ownershipId: ownership.id,
      },
    };
  }

  if (!user.isAdmin) {
    return {
      ok: false,
      status: 403,
      error: "Forbidden",
    };
  }

  if (!MANAGEMENT_API_KEY) {
    return {
      ok: false,
      status: 500,
      error: "Management API key not configured",
    };
  }

  const endpoint = `${MANAGEMENT_BASE_URL}/auth-files`;

  try {
    const response = await fetchWithTimeout(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${MANAGEMENT_API_KEY}`,
      },
    });

    if (!response.ok) {
      await response.body?.cancel();
      return {
        ok: false,
        status: 502,
        error: `Failed to fetch OAuth accounts: HTTP ${response.status}`,
      };
    }

    const payload = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.files)) {
      return {
        ok: false,
        status: 502,
        error: "Invalid Management API response for OAuth accounts",
      };
    }

    const matchingAccount = payload.files.find(
      (entry) => isRecord(entry) && readOptionalString(entry.name) === normalizedAccountName
    );

    if (!matchingAccount || !isRecord(matchingAccount)) {
      return {
        ok: false,
        status: 404,
        error: "OAuth account not found",
      };
    }

    return {
      ok: true,
      account: {
        accountName: normalizedAccountName,
        accountEmail: readOptionalString(matchingAccount.email),
        provider:
          readOptionalString(matchingAccount.provider) ?? readOptionalString(matchingAccount.type),
        isAdmin: true,
        isOwner: false,
        ownershipId: null,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logger.error(
        { err: error, endpoint, timeoutMs: FETCH_TIMEOUT_MS },
        "Fetch timeout - resolveOAuthAccountAccess GET"
      );
      return {
        ok: false,
        status: 504,
        error: "Request timed out fetching OAuth account details",
      };
    }

    logger.error({ err: error, endpoint, accountName: normalizedAccountName }, "resolveOAuthAccountAccess error");
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Failed to fetch OAuth account details",
    };
  }
}
