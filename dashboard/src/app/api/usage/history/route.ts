import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { Errors } from "@/lib/errors";
import {
  getUsageHistorySnapshot,
  isValidUsageHistoryDateParam,
} from "@/lib/usage/history";

type UsageWindow = "7h" | "24h" | "7d" | "all";

function isUsageWindow(value: string | null): value is UsageWindow {
  return value === "7h" || value === "24h" || value === "7d" || value === "all";
}

function buildWindowRange(window: UsageWindow): {
  fromDate: Date;
  toDate: Date;
  fromParam: string;
  toParam: string;
} {
  const now = new Date();
  const toDate = new Date(now);
  let fromDate: Date;

  switch (window) {
    case "7h":
      fromDate = new Date(now.getTime() - 7 * 60 * 60 * 1000);
      break;
    case "24h":
      fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "all":
      fromDate = new Date("2020-01-01T00:00:00.000Z");
      break;
  }

  return {
    fromDate,
    toDate,
    fromParam: fromDate.toISOString().slice(0, 10),
    toParam: toDate.toISOString().slice(0, 10),
  };
}

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return Errors.unauthorized();
  }

  const searchParams = request.nextUrl.searchParams;
  const windowParam = searchParams.get("window");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (isUsageWindow(windowParam)) {
    try {
      const range = buildWindowRange(windowParam);
      const snapshot = await getUsageHistorySnapshot({
        userId: session.userId,
        fromDate: range.fromDate,
        toDate: range.toDate,
        fromParam: range.fromParam,
        toParam: range.toParam,
      });

      return NextResponse.json(snapshot);
    } catch {
      return Errors.internal("Failed to fetch usage history");
    }
  }

  if (!fromParam || !toParam) {
    return Errors.missingFields(["from", "to"]);
  }

  if (!isValidUsageHistoryDateParam(fromParam) || !isValidUsageHistoryDateParam(toParam)) {
    return Errors.validation("Invalid date format. Use YYYY-MM-DD.");
  }

  const fromDate = new Date(`${fromParam}T00:00:00.000Z`);
  const toDate = new Date(`${toParam}T23:59:59.999Z`);

  if (fromDate > toDate) {
    return Errors.validation("from date must be before to date");
  }

  try {
    const snapshot = await getUsageHistorySnapshot({
      userId: session.userId,
      fromDate,
      toDate,
      fromParam,
      toParam,
    });

    return NextResponse.json(snapshot);
  } catch {
    return Errors.internal("Failed to fetch usage history");
  }
}
