import path from "node:path";

export const DEFAULT_PROXY_CONTAINER_NAME = "cliproxyapi";
export const PROXY_COMPOSE_SERVICE_NAME = "cliproxyapi";
export const PROXY_CONTAINER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
type ProxyRuntimeEnv = Record<string, string | undefined>;

export function getProxyContainerName(
  env: ProxyRuntimeEnv = process.env as ProxyRuntimeEnv,
): string {
  const containerName =
    env.CLIPROXYAPI_CONTAINER_NAME?.trim() || DEFAULT_PROXY_CONTAINER_NAME;

  if (!PROXY_CONTAINER_NAME_PATTERN.test(containerName)) {
    throw new Error("Invalid CLIPROXYAPI_CONTAINER_NAME");
  }

  return containerName;
}

export function getProxyComposeFileCandidates(
  env: ProxyRuntimeEnv = process.env as ProxyRuntimeEnv,
  cwd = process.cwd(),
): string[] {
  const containerName = getProxyContainerName(env);
  const isDevContainer = containerName.includes("-dev-");
  const candidates = [
    ...(isDevContainer
      ? [
          path.resolve(cwd, "docker-compose.dev.yml"),
          path.resolve(cwd, "dashboard/docker-compose.dev.yml"),
        ]
      : []),
    "/opt/cliproxyapi/infrastructure/docker-compose.yml",
    path.resolve(cwd, "../infrastructure/docker-compose.yml"),
    path.resolve(cwd, "infrastructure/docker-compose.yml"),
  ];

  return [...new Set(candidates)];
}

export function resolveProxyComposeFile(
  env: ProxyRuntimeEnv = process.env as ProxyRuntimeEnv,
  cwd = process.cwd(),
  exists: (filePath: string) => boolean,
): string | null {
  for (const candidate of getProxyComposeFileCandidates(env, cwd)) {
    if (exists(candidate)) {
      return candidate;
    }
  }

  return null;
}
