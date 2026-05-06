import { Prisma } from "@/generated/prisma/client";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "";
}

export function isUsageRecordEndpointUnavailableError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  if (!message) {
    return false;
  }

  const referencesUsageRecord =
    message.includes("usagerecord") ||
    message.includes("usage_records");
  const referencesEndpoint =
    message.includes("`endpoint`") ||
    message.includes("\"endpoint\"") ||
    message.includes("usage_records.endpoint") ||
    message.includes(".endpoint");
  const indicatesMissingField =
    message.includes("unknown field") ||
    message.includes("unknown arg") ||
    message.includes("does not exist");

  if (!referencesUsageRecord || !referencesEndpoint || !indicatesMissingField) {
    return false;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2022";
  }

  return true;
}

export function omitUsageRecordEndpoint<T extends { endpoint?: unknown }>(
  record: T
): Omit<T, "endpoint"> {
  const { endpoint: _endpoint, ...rest } = record;
  return rest;
}

export function omitUsageRecordEndpointFromMany<T extends { endpoint?: unknown }>(
  records: T[]
): Array<Omit<T, "endpoint">> {
  return records.map((record) => omitUsageRecordEndpoint(record));
}
