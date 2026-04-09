import { existsSync } from "node:fs";
import { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { validateOrigin } from "@/lib/auth/origin";
import { prisma } from "@/lib/db";
import { execFile } from "child_process";
import { promisify } from "util";
import { Errors, apiSuccess } from "@/lib/errors";
import { UpdateProxySchema } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";
import {
  getProxyContainerName,
  PROXY_COMPOSE_SERVICE_NAME,
  resolveProxyComposeFile,
} from "@/lib/proxy-runtime";

const execFileAsync = promisify(execFile);

const IMAGE_NAME = "eceasy/cli-proxy-api-plus";

interface PortBinding {
  HostIp: string;
  HostPort: string;
}

interface ContainerConfig {
  env: string[];
  volumes: string[];
  networks: string[];
  ports: string[];
  restartPolicy: string;
}

function getCommandErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function getContainerConfig(containerName: string): Promise<ContainerConfig> {
  const { stdout } = await execFileAsync("docker", ["inspect", containerName]);
  const inspect = JSON.parse(stdout)[0];
  const config = inspect.Config;
  const hostConfig = inspect.HostConfig;

  const ports: string[] = [];
  const portBindings: Record<string, PortBinding[]> =
    hostConfig.PortBindings || {};

  for (const containerPort of Object.keys(portBindings)) {
    for (const binding of portBindings[containerPort] || []) {
      const hostIp = binding.HostIp || "";
      const hostPort = binding.HostPort;
      const port = containerPort.replace("/tcp", "");
      ports.push(hostIp ? `${hostIp}:${hostPort}:${port}` : `${hostPort}:${port}`);
    }
  }

  return {
    env: config.Env || [],
    volumes: hostConfig.Binds || [],
    networks: Object.keys(inspect.NetworkSettings?.Networks || {}),
    ports,
    restartPolicy: hostConfig.RestartPolicy?.Name || "unless-stopped",
  };
}

function buildRunArgs(
  cfg: ContainerConfig,
  imageTag: string,
  containerName: string,
): string[] {
  const args = [
    "run", "-d", "--name", containerName,
    "--restart", cfg.restartPolicy || "unless-stopped",
  ];

  for (const env of cfg.env) { args.push("-e", env); }
  for (const vol of cfg.volumes) { args.push("-v", vol); }
  for (const port of cfg.ports) { args.push("-p", port); }
  for (const net of cfg.networks) { args.push("--network", net); }

  args.push(
    "--health-cmd", "wget --no-verbose --tries=1 -O /dev/null http://localhost:8317/",
    "--health-interval", "30s",
    "--health-timeout", "10s",
    "--health-retries", "3",
    "--health-start-period", "20s"
  );

  args.push(imageTag);
  return args;
}

async function removeContainerIfExists(containerName: string) {
  try {
    await execFileAsync("docker", ["rm", "-f", containerName]);
  } catch (error) {
    const errorText = getCommandErrorText(error);
    if (!errorText.includes("No such container")) {
      throw error;
    }
  }
}

async function recreateWithDockerRun(
  config: ContainerConfig,
  imageTag: string,
  containerName: string,
) {
  await removeContainerIfExists(containerName);
  await execFileAsync("docker", buildRunArgs(config, imageTag, containerName));
}

async function runCompose(composeFile: string, args: string[]) {
  return execFileAsync("docker", ["compose", "-f", composeFile, ...args]);
}

async function isComposeAvailable() {
  try {
    await execFileAsync("docker", ["compose", "version"]);
    return true;
  } catch (error) {
    const errorText = getCommandErrorText(error);
    const composeMissing =
      errorText.includes("unknown command: docker compose") ||
      errorText.includes("unknown shorthand flag: 'f' in -f");

    if (composeMissing) {
      logger.info("Docker compose not available in runtime, using docker run fallback");
    } else {
      logger.warn({ err: error }, "Compose availability check failed, using fallback");
    }

    return false;
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return Errors.unauthorized();
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    return Errors.forbidden();
  }

  const originError = validateOrigin(request);
  if (originError) return originError;

  let configSnapshot: ContainerConfig | null = null;
  let composeAvailable = false;
  let composeFile: string | null = null;
  let containerName: string | null = null;

  try {
    const body = await request.json();
    const result = UpdateProxySchema.safeParse(body);

    if (!result.success) {
      return Errors.zodValidation(result.error.issues);
    }

    const { version } = result.data;

    containerName = getProxyContainerName();
    const imageTag = `${IMAGE_NAME}:${version}`;
    configSnapshot = await getContainerConfig(containerName);
    composeFile = resolveProxyComposeFile(process.env, process.cwd(), existsSync);
    composeAvailable = composeFile !== null && await isComposeAvailable();

    const pullResult = await execFileAsync("docker", ["pull", imageTag]);
    logger.info({ stdout: pullResult.stdout }, "Pull result");

    if (composeAvailable && version !== "latest") {
      await execFileAsync("docker", ["tag", imageTag, `${IMAGE_NAME}:latest`]);
      logger.info({ version }, "Tagged selected version as latest for compose rollout");
    }

    if (composeAvailable && composeFile) {
      await runCompose(composeFile, ["up", "-d", "--no-deps", "--force-recreate", PROXY_COMPOSE_SERVICE_NAME]);
    } else {
      await recreateWithDockerRun(configSnapshot, imageTag, containerName);
    }

    return apiSuccess({ message: `Updated to ${version}`, version });
  } catch (error) {
    try {
      if (composeAvailable && composeFile) {
        await runCompose(composeFile, ["up", "-d", "--no-deps", PROXY_COMPOSE_SERVICE_NAME]);
        logger.info("Recovery: compose ensured proxy service is up");
      } else if (configSnapshot && containerName) {
        await recreateWithDockerRun(
          configSnapshot,
          `${IMAGE_NAME}:latest`,
          containerName,
        );
        logger.info("Recovery: recreated proxy container with latest image");
      }
    } catch (restartError) {
      logger.error({ err: restartError }, "Recovery failed");
    }

    return Errors.internal("Update failed", error);
  }
}
