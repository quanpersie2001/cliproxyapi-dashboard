import { describe, expect, it } from "vitest";
import {
  isUsageRecordEndpointUnavailableError,
  omitUsageRecordEndpoint,
  omitUsageRecordEndpointFromMany,
} from "@/lib/usage/endpoint-compat";

describe("isUsageRecordEndpointUnavailableError", () => {
  it("detects Prisma validation errors from stale clients", () => {
    const error = new Error(
      "Unknown field `endpoint` for select statement on model `UsageRecord`."
    );

    expect(isUsageRecordEndpointUnavailableError(error)).toBe(true);
  });

  it("detects missing database column errors", () => {
    const error = new Error(
      "The column `main.usage_records.endpoint` does not exist in the current database."
    );

    expect(isUsageRecordEndpointUnavailableError(error)).toBe(true);
  });

  it("ignores unrelated Prisma errors", () => {
    const error = new Error(
      "Unknown field `username` for select statement on model `User`."
    );

    expect(isUsageRecordEndpointUnavailableError(error)).toBe(false);
  });
});

describe("omitUsageRecordEndpoint helpers", () => {
  it("removes endpoint from a single record", () => {
    expect(
      omitUsageRecordEndpoint({
        authIndex: "auth-1",
        endpoint: "/v1/chat/completions",
        model: "gpt-4.1",
      })
    ).toEqual({
      authIndex: "auth-1",
      model: "gpt-4.1",
    });
  });

  it("removes endpoint from many records", () => {
    expect(
      omitUsageRecordEndpointFromMany([
        { authIndex: "auth-1", endpoint: "/v1/chat/completions" },
        { authIndex: "auth-2", endpoint: null },
      ])
    ).toEqual([
      { authIndex: "auth-1" },
      { authIndex: "auth-2" },
    ]);
  });
});
