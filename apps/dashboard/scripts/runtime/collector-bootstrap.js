#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const COLLECTOR_MODE_FLAG = "--collector";
const BUILD_TIME_DATABASE_URL = "postgresql://build:build@localhost:5432/build";
const BUILD_TIME_JWT_SECRET = "build-time-placeholder-at-least-32-chars";
const BUILD_TIME_MANAGEMENT_API_KEY = "build-time-placeholder-16ch";
const GRACEFUL_SHUTDOWN_MS = parsePositiveInt(
  process.env.USAGE_COLLECTOR_SHUTDOWN_GRACE_MS,
  10000,
);

const preloadedLocalEnv = loadLocalEnv();

if (process.argv.includes(COLLECTOR_MODE_FLAG)) {
  runCollectorWorkerProcess().catch((error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error(`[usage-collector] runtime failed: ${message}`);
    process.exit(1);
  });
} else {
  runCoordinator();
}

async function runCollectorWorkerProcess() {
  neutralizeServerOnlyModule();
  const runtimeModulePath = path.join(
    __dirname,
    "server",
    "jobs",
    "workers",
    "usage-collector",
    "runtime-main.js",
  );
  const runtimeModule = require(runtimeModulePath);
  if (typeof runtimeModule.runCollectorRuntime !== "function") {
    throw new Error("collector runtime export runCollectorRuntime() not found");
  }

  const signal = { aborted: false };

  const stop = (reason) => {
    if (signal.aborted) {
      return;
    }
    signal.aborted = true;
    console.log(`[usage-collector] stopping (${reason})`);
  };

  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  await runtimeModule.runCollectorRuntime({ signal });
  process.exit(0);
}

function neutralizeServerOnlyModule() {
  try {
    const serverOnlyPath = require.resolve("server-only");
    require.cache[serverOnlyPath] = {
      id: serverOnlyPath,
      filename: serverOnlyPath,
      loaded: true,
      exports: {},
    };
  } catch {
    // Optional in non-Next runtimes.
  }
}

function runCoordinator() {
  const children = new Map();
  let shuttingDown = false;
  let shutdownTimer = null;
  let finalExitCode = 0;

  const runtimeEnv = buildServerEnv();
  const server = startChild("server", process.execPath, [resolveServerEntry()], runtimeEnv);
  const collector = startChild("collector", process.execPath, [__filename, COLLECTOR_MODE_FLAG], runtimeEnv);

  children.set("server", server);
  children.set("collector", collector);

  process.on("SIGINT", () => initiateShutdown("SIGINT"));
  process.on("SIGTERM", () => initiateShutdown("SIGTERM"));

  function startChild(name, command, args, env = process.env) {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
    });

    child.on("exit", (code, signal) => {
      children.delete(name);

      if (!shuttingDown) {
        if (name === "collector") {
          const collectorExitCode = normalizeExitCode(code, signal);
          console.error(
            `[bootstrap] collector exited (${collectorExitCode}); server stays online`,
          );
          return;
        }

        finalExitCode = normalizeExitCode(code, signal);
        initiateShutdown(`${name}-exit`);
        return;
      }

      children.delete(name);
      if (children.size === 0) {
        if (shutdownTimer) {
          clearTimeout(shutdownTimer);
        }
        process.exit(finalExitCode);
      }
    });

    return child;
  }

  function initiateShutdown(reason) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`[bootstrap] stopping children (${reason})`);

    for (const child of children.values()) {
      terminate(child, "SIGTERM");
    }

    shutdownTimer = setTimeout(() => {
      for (const child of children.values()) {
        terminate(child, "SIGKILL");
      }
    }, GRACEFUL_SHUTDOWN_MS);
  }
}

function terminate(child, signal) {
  if (child.killed || child.exitCode !== null) {
    return;
  }

  try {
    child.kill(signal);
  } catch {
    // Child may already be exiting; best effort only.
  }
}

function buildServerEnv() {
  const mergedEnv = {
    ...preloadedLocalEnv,
    ...process.env,
  };

  return {
    ...mergedEnv,
    DATABASE_URL: mergedEnv.DATABASE_URL || BUILD_TIME_DATABASE_URL,
    JWT_SECRET: mergedEnv.JWT_SECRET || BUILD_TIME_JWT_SECRET,
    MANAGEMENT_API_KEY: mergedEnv.MANAGEMENT_API_KEY || BUILD_TIME_MANAGEMENT_API_KEY,
  };
}

function loadLocalEnv() {
  const appRoot = resolveAppRoot();
  const workspaceRoot = path.resolve(appRoot, "..");
  const candidates = [
    path.join(appRoot, ".env.local"),
    path.join(appRoot, "tools", "dev", ".env.development"),
    path.join(appRoot, ".env.development"),
    path.join(workspaceRoot, ".env"),
  ];

  const merged = {};
  for (const envFilePath of candidates) {
    Object.assign(merged, readSimpleDotenv(envFilePath));
  }

  return merged;
}

function readSimpleDotenv(envFilePath) {
  if (!fs.existsSync(envFilePath)) {
    return {};
  }

  const parsed = {};
  const raw = fs.readFileSync(envFilePath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    parsed[key] = stripWrappingQuotes(value);
  }

  return parsed;
}

function stripWrappingQuotes(value) {
  if (value.length < 2) {
    return value;
  }

  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }

  return value;
}

function resolveAppRoot() {
  const candidates = [
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "..", ".."),
  ];

  for (const candidate of candidates) {
    const packageJsonPath = path.join(candidate, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      return candidate;
    }
  }

  return path.resolve(__dirname, "..");
}

function resolveServerEntry() {
  const appRoot = resolveAppRoot();
  const standaloneRoot = path.join(appRoot, ".next", "standalone");
  const candidates = [
    path.join(standaloneRoot, "server.js"),
    path.join(standaloneRoot, "apps", "dashboard", "server.js"),
    path.join(appRoot, "server.js"),
    path.join(appRoot, "app", "server.js"),
    path.join(appRoot, "apps", "dashboard", "server.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const discoveredStandaloneEntry = findStandaloneServerEntry(standaloneRoot);
  if (discoveredStandaloneEntry) {
    return discoveredStandaloneEntry;
  }

  throw new Error("server entrypoint not found; build the app before starting the coordinator");
}

function findStandaloneServerEntry(standaloneRoot) {
  if (!fs.existsSync(standaloneRoot)) {
    return null;
  }

  const queue = [standaloneRoot];

  while (queue.length > 0) {
    const current = queue.shift();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === "node_modules") {
        continue;
      }

      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name === "server.js") {
        return entryPath;
      }
    }
  }

  return null;
}

function normalizeExitCode(code, signal) {
  if (typeof code === "number") {
    return code;
  }

  if (signal) {
    return 1;
  }

  return 0;
}

function parsePositiveInt(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}
