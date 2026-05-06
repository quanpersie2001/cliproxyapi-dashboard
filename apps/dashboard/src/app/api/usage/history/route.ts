import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { Errors } from "@/lib/errors";
import { loadUsageHistorySnapshot } from "@/server/usage/services/get-usage-history-snapshot";
import {
  buildExplicitUsageRange,
  buildUsageWindowRange,
  isUsageWindow,
} from "@/server/usage/services/resolve-usage-range";

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return Errors.unauthorized();
  }

  const searchParams = request.nextUrl.searchParams;
  const windowParam = searchParams.get("window");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  try {
    if (isUsageWindow(windowParam)) {
      const range = buildUsageWindowRange(windowParam);
      const snapshot = await loadUsageHistorySnapshot({
        userId: session.userId,
        fromDate: range.fromDate,
        toDate: range.toDate,
        fromParam: range.fromParam,
        toParam: range.toParam,
      });

      return NextResponse.json(snapshot);
    }

    const explicitRange = buildExplicitUsageRange(fromParam, toParam);
    if (!explicitRange.ok) {
      if (explicitRange.error === "missing_fields") {
        return Errors.missingFields(["from", "to"]);
      }
      if (explicitRange.error === "invalid_format") {
        return Errors.validation("Invalid date format. Use YYYY-MM-DD.");
      }
      return Errors.validation("from date must be before to date");
    }

    const snapshot = await loadUsageHistorySnapshot({
      userId: session.userId,
      fromDate: explicitRange.range.fromDate,
      toDate: explicitRange.range.toDate,
      fromParam: explicitRange.range.fromParam,
      toParam: explicitRange.range.toParam,
    });

    return NextResponse.json(snapshot);
  } catch {
    return Errors.internal("Failed to fetch usage history");
  }
}
