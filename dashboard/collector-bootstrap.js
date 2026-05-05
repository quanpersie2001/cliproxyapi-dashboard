#!/usr/bin/env node

const { spawn } = require("node:child_process");

const COLLECTOR_MODE_FLAG = "--collector";
const GRACEFUL_SHUTDOWN_MS = parsePositiveInt(
  process.env.USAGE_COLLECTOR_SHUTDOWN_GRACE_MS,
  10000,
);

if (process.argv.includes(COLLECTOR_MODE_FLAG)) {
  runCollectorPlaceholder();
} else {
  runCoordinator();
}

function runCollectorPlaceholder() {
  console.log("[usage-collector] placeholder started");

  const heartbeat = setInterval(() => {}, 60000);

  const stop = (signal) => {
    clearInterval(heartbeat);
    console.log(`[usage-collector] placeholder stopping (${signal})`);
    process.exit(0);
  };

  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
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
      if (!shuttingDown) {
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
