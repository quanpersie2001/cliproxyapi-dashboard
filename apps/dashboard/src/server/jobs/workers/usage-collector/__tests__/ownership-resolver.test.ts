import { describe, expect, it } from "vitest";
import {
  resolveUsageOwnership,
  type UsageOwnershipDirectories,
} from "@/server/jobs/workers/usage-collector/core/ownership-resolver";

function createDirectories(): UsageOwnershipDirectories {
  return {
    fullKeyToOwner: new Map([
      [
        "sk-group-key",
        {
          userId: "user-group",
          apiKeyId: "api-group",
        },
      ],
    ]),
    authIndexToFile: new Map([
      [
        "auth-1",
        {
          fileName: "claude-account.json",
          email: "user@example.com",
        },
      ],
    ]),
    sourceToUser: new Map([
      ["claude-account.json", "user-file"],
      ["user@example.com", "user-email"],
      ["source-owner", "user-source"],
    ]),
    authIndexPrefixToOwner: new Map([
      [
        "auth-prefix",
        {
          userId: "user-prefix",
          apiKeyId: "api-prefix",
        },
      ],
      [
        "sk-live-1...z9q2",
        {
          userId: "user-masked",
          apiKeyId: "api-masked",
        },
      ],
    ]),
    userToApiKey: new Map([["user-file", "api-from-user"]]),
  };
}

describe("resolveUsageOwnership", () => {
  it("prefers API key grouping when apiGroupKey maps directly to a full key", () => {
    const result = resolveUsageOwnership(
      {
        apiGroupKey: "sk-group-key",
        authIndex: "auth-1",
        source: "source-owner",
      },
      createDirectories()
    );

    expect(result).toEqual({
      userId: "user-group",
      apiKeyId: "api-group",
      resolutionPath: "api-grouping",
    });
  });

  it("prefers explicit apiKey over source-based fallback", () => {
    const result = resolveUsageOwnership(
      {
        apiGroupKey: "/v1/chat/completions",
        apiKey: "sk-group-key",
        authIndex: "auth-1",
        source: "source-owner",
      },
      createDirectories()
    );

    expect(result).toEqual({
      userId: "user-group",
      apiKeyId: "api-group",
      resolutionPath: "api-grouping",
    });
  });

  it("falls back when explicit apiKey is unknown", () => {
    const result = resolveUsageOwnership(
      {
        apiGroupKey: "/v1/chat/completions",
        apiKey: "sk-unknown",
        authIndex: "auth-1",
        source: "source-owner",
      },
      createDirectories()
    );

    expect(result).toEqual({
      userId: "user-file",
      apiKeyId: "api-from-user",
      resolutionPath: "auth-file-filename",
    });
  });

  it("falls back to auth-file ownership and resolves apiKeyId from user when needed", () => {
    const result = resolveUsageOwnership(
      {
        apiGroupKey: null,
        authIndex: "auth-1",
        source: "",
      },
      createDirectories()
    );

    expect(result).toEqual({
      userId: "user-file",
      apiKeyId: "api-from-user",
      resolutionPath: "auth-file-filename",
    });
  });

  it("uses auth-index prefix fallback when no stronger signal is available", () => {
    const result = resolveUsageOwnership(
      {
        apiGroupKey: null,
        authIndex: "auth-prefix",
        source: null,
      },
      createDirectories()
    );

    expect(result).toEqual({
      userId: "user-prefix",
      apiKeyId: "api-prefix",
      resolutionPath: "auth-index-prefix",
    });
  });

  it("matches masked provider key identifiers against auth index", () => {
    const result = resolveUsageOwnership(
      {
        apiGroupKey: null,
        authIndex: "sk-live-1234567890z9q2",
        source: null,
      },
      createDirectories()
    );

    expect(result).toEqual({
      userId: "user-masked",
      apiKeyId: "api-masked",
      resolutionPath: "auth-index-prefix",
    });
  });

  it("matches auth index case-insensitively for masked provider key identifiers", () => {
    const result = resolveUsageOwnership(
      {
        apiGroupKey: null,
        authIndex: "SK-LIVE-1234567890Z9Q2",
        source: null,
      },
      createDirectories()
    );

    expect(result).toEqual({
      userId: "user-masked",
      apiKeyId: "api-masked",
      resolutionPath: "auth-index-prefix",
    });
  });
});
