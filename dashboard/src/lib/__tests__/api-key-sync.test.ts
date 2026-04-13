import { describe, expect, it } from "vitest";
import {
  buildCliProxyApiKeyPayload,
  deriveCliProxyLockdownApiKey,
} from "@/lib/api-keys/payload";

describe("deriveCliProxyLockdownApiKey", () => {
  it("derives a stable sk-prefixed lockdown key from the management key", () => {
    expect(deriveCliProxyLockdownApiKey("devmanagementkey")).toBe(
      "sk-e691c43340dc2c6853e59ca2606710e2068be46954df21a9f313777641858605"
    );
  });
});

describe("buildCliProxyApiKeyPayload", () => {
  it("keeps real user keys unchanged when at least one exists", () => {
    expect(
      buildCliProxyApiKeyPayload(["sk-user-1", "sk-user-2"], "devmanagementkey")
    ).toEqual(["sk-user-1", "sk-user-2"]);
  });

  it("uses the derived lockdown key when there are no user keys", () => {
    expect(buildCliProxyApiKeyPayload([], "devmanagementkey")).toEqual([
      "sk-e691c43340dc2c6853e59ca2606710e2068be46954df21a9f313777641858605",
    ]);
  });
});
