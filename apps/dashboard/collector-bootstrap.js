#!/usr/bin/env node

const Module = require("node:module");
const path = require("node:path");
const { spawn } = require("node:child_process");

const COLLECTOR_MODE_FLAG = "--collector";
const GRACEFUL_SHUTDOWN_MS = parsePositiveInt(
  process.env.USAGE_COLLECTOR_SHUTDOWN_GRACE_MS,
  10000,
);
let aliasResolutionEnabled = false;

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
  enableCollectorAliasResolution();
  const runtimeModulePath = path.join(__dirname, "workers", "usage-collector", "runtime-main.js");
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

function enableCollectorAliasResolution() {
  if (aliasResolutionEnabled) {
    return;
  }

  const collectorRoot = __dirname;
  const originalResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function patchedResolveFilename(request, parent, isMain, options) {
    if (typeof request === "string" && request.startsWith("@/")) {
      const mappedPath = path.join(collectorRoot, request.slice(2));
      return originalResolveFilename.call(this, mappedPath, parent, isMain, options);
    }

    return originalResolveFilename.call(this, request, parent, isMain, options);
  };

  aliasResolutionEnabled = true;
}

function runCoordinator() {
  const children = new Map();
  let shuttingDown = false;
  let shutdownTimer = null;
  let finalExitCode = 0;

  const server = startChild("server", process.execPath, ["server.js"]);
  const collector = startChild("collector", process.execPath, [__filename, COLLECTOR_MODE_FLAG]);

  children.set("server", server);
  children.set("collector", collector);

  process.on("SIGINT", () => initiateShutdown("SIGINT"));
  process.on("SIGTERM", () => initiateShutdown("SIGTERM"));

  function startChild(name, command, args) {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
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
