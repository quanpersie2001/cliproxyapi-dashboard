#!/usr/bin/env node

const { spawn } = require("node:child_process");

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const children = new Map();
let shuttingDown = false;
let finalExitCode = 0;

const app = startChild("app", ["run", "dev:app"]);
const collector = startChild("collector", ["run", "dev:collector"]);

children.set("app", app);
children.set("collector", collector);

process.on("SIGINT", () => initiateShutdown("SIGINT"));
process.on("SIGTERM", () => initiateShutdown("SIGTERM"));

function startChild(name, args) {
  const child = spawn(npmCommand, args, {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    children.delete(name);

    if (!shuttingDown) {
      finalExitCode = normalizeExitCode(code, signal);
      initiateShutdown(`${name}-exit`);
      return;
    }

    if (children.size === 0) {
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
  console.log(`[dev-runner] stopping children (${reason})`);

  for (const child of children.values()) {
    terminate(child, "SIGTERM");
  }
}

function terminate(child, signal) {
  if (child.killed || child.exitCode !== null) {
    return;
  }

  try {
    child.kill(signal);
  } catch {}
}

function normalizeExitCode(code, signal) {
  if (typeof code === "number") {
    return code;
  }

  if (signal === "SIGINT") {
    return 130;
  }

  if (signal === "SIGTERM") {
    return 143;
  }

  return 1;
}
