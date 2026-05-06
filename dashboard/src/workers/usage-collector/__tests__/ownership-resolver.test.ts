import { describe, expect, it } from "vitest";
import {
  resolveUsageOwnership,
  type UsageOwnershipDirectories,
} from "@/workers/usage-collector/core/ownership-resolver";

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
});
