import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROXY_CONTAINER_NAME,
  getProxyContainerName,
  resolveProxyComposeFile,
} from "@/lib/proxy-runtime";

describe("getProxyContainerName", () => {
  it("falls back to the default proxy container name", () => {
    expect(getProxyContainerName({})).toBe(DEFAULT_PROXY_CONTAINER_NAME);
  });

  it("returns the configured container name when valid", () => {
    expect(
      getProxyContainerName({ CLIPROXYAPI_CONTAINER_NAME: "cliproxyapi-dev-api" }),
    ).toBe("cliproxyapi-dev-api");
  });

  it("throws when the configured container name is invalid", () => {
    expect(() =>
      getProxyContainerName({ CLIPROXYAPI_CONTAINER_NAME: "bad name" }),
    ).toThrow(/Invalid CLIPROXYAPI_CONTAINER_NAME/);
  });
});

describe("resolveProxyComposeFile", () => {
  it("prefers the dev compose file for dev-local proxy containers", () => {
    const cwd = "/workspace/dashboard";
    const devCompose = path.resolve(cwd, "docker-compose.dev.yml");
    const prodCompose = path.resolve(cwd, "../infrastructure/docker-compose.yml");

    const resolved = resolveProxyComposeFile(
      { CLIPROXYAPI_CONTAINER_NAME: "cliproxyapi-dev-api" },
      cwd,
      (candidate) => candidate === devCompose || candidate === prodCompose,
    );

    expect(resolved).toBe(devCompose);
  });

  it("uses the repo infrastructure compose file for local production-like setups", () => {
    const cwd = "/workspace/dashboard";
    const prodCompose = path.resolve(cwd, "../infrastructure/docker-compose.yml");

    const resolved = resolveProxyComposeFile(
      { CLIPROXYAPI_CONTAINER_NAME: "cliproxyapi" },
      cwd,
      (candidate) => candidate === prodCompose,
    );

    expect(resolved).toBe(prodCompose);
  });

  it("returns null when no known compose file is available", () => {
    const resolved = resolveProxyComposeFile(
      { CLIPROXYAPI_CONTAINER_NAME: "cliproxyapi" },
      "/workspace/dashboard",
      () => false,
    );

    expect(resolved).toBeNull();
  });
});
