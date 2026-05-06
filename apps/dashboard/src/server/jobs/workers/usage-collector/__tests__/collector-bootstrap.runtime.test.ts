import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const DASHBOARD_ROOT = path.resolve(__dirname, "../../../../../..");

const childProcesses: Array<ReturnType<typeof spawn>> = [];

afterEach(() => {
  while (childProcesses.length > 0) {
    const child = childProcesses.pop();
    if (!child || child.killed) {
      continue;
    }
    child.kill("SIGKILL");
  }

  const fixtureServerEntry = path.join(DASHBOARD_ROOT, "server.js");
  if (fs.existsSync(fixtureServerEntry)) {
    fs.unlinkSync(fixtureServerEntry);
  }
});

describe("collector-bootstrap runtime", () => {
  it(
    "starts the real worker runtime in --collector mode (no placeholder loop)",
    async () => {
      execFileSync("npm", ["run", "build:collector"], {
        cwd: DASHBOARD_ROOT,
        stdio: "pipe",
        env: process.env,
      });

      const child = spawn("node", ["dist-collector/collector-bootstrap.js", "--collector"], {
        cwd: DASHBOARD_ROOT,
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/test",
          JWT_SECRET:
            process.env.JWT_SECRET || "test-secret-with-minimum-32-characters",
          MANAGEMENT_API_KEY:
            process.env.MANAGEMENT_API_KEY || "test-management-api-key-1234",
          CLIPROXYAPI_MANAGEMENT_URL:
            process.env.CLIPROXYAPI_MANAGEMENT_URL ||
            "http://127.0.0.1:8317/v0/management",
          USAGE_COLLECTOR_ENABLED: "false",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      childProcesses.push(child);

      let output = "";
      child.stdout?.on("data", (chunk) => {
        output += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk) => {
        output += chunk.toString("utf8");
      });

      await waitFor(
        () => output.includes("[usage-collector] worker runtime started"),
        20_000,
        "collector runtime did not start"
      );

    child.kill("SIGTERM");

    const exitCode = await new Promise<number | null>((resolve) => {
      child.once("close", (code) => resolve(code));
    });

      expect(exitCode).toBe(0);
      expect(output).toContain("[usage-collector] worker runtime started");
      expect(output).not.toContain("placeholder started");
    },
    30_000
  );

  it("keeps server child alive when collector exits first in coordinator mode", () => {
    ensureServerEntrypointFixture();
    const harnessResultRaw = execFileSync(
      "node",
      [
        "-e",
        `
const cp = require("node:child_process");
const { EventEmitter } = require("node:events");
const path = require("node:path");

const spawned = [];
const killCalls = [];
const exitCalls = [];

function createChild(name) {
  const child = new EventEmitter();
  child.killed = false;
  child.exitCode = null;
  child.kill = (signal) => {
    killCalls.push({ name, signal });
    child.killed = true;
    return true;
  };
  return child;
}

cp.spawn = (command, args) => {
  const name = spawned.length === 0 ? "server" : "collector";
  const child = createChild(name);
  spawned.push({ name, command, args });
  if (name === "collector") {
    setImmediate(() => child.emit("exit", 1, null));
  }
  return child;
};

process.exit = (code) => {
  exitCalls.push(typeof code === "number" ? code : 0);
};

require(path.join(process.cwd(), "scripts/runtime/collector-bootstrap.js"));

setTimeout(() => {
  const report = {
    spawnCount: spawned.length,
    serverKillCalls: killCalls.filter((entry) => entry.name === "server").length,
    collectorKillCalls: killCalls.filter((entry) => entry.name === "collector").length,
    exitCalls
  };
  process.stdout.write(JSON.stringify(report));
}, 50);
        `,
      ],
      {
        cwd: DASHBOARD_ROOT,
        env: {
          ...process.env,
          USAGE_COLLECTOR_SHUTDOWN_GRACE_MS: "25",
        },
        encoding: "utf8",
      }
    );

    const reportLine = harnessResultRaw
      .trim()
      .split("\n")
      .findLast((line) => line.trim().startsWith("{"));
    if (!reportLine) {
      throw new Error(`missing harness JSON report: ${harnessResultRaw}`);
    }

    const harnessResult = JSON.parse(reportLine) as {
      spawnCount: number;
      serverKillCalls: number;
      collectorKillCalls: number;
      exitCalls: number[];
    };

    expect(harnessResult.spawnCount).toBe(2);
    expect(harnessResult.serverKillCalls).toBe(0);
  });

  it("completes shutdown when server exits first and collector exits during shutdown", () => {
    ensureServerEntrypointFixture();
    const harnessResultRaw = execFileSync(
      "node",
      [
        "-e",
        `
const cp = require("node:child_process");
const { EventEmitter } = require("node:events");
const path = require("node:path");

const spawned = [];
const killCalls = [];
const exitCalls = [];
const childrenByName = new Map();

function createChild(name) {
  const child = new EventEmitter();
  child.killed = false;
  child.exitCode = null;
  child.kill = (signal) => {
    killCalls.push({ name, signal });
    child.killed = true;
    if (name === "collector") {
      setImmediate(() => child.emit("exit", 0, null));
    }
    return true;
  };
  return child;
}

cp.spawn = (command, args) => {
  const name = spawned.length === 0 ? "server" : "collector";
  const child = createChild(name);
  spawned.push({ name, command, args });
  childrenByName.set(name, child);

  if (name === "collector") {
    setImmediate(() => {
      const server = childrenByName.get("server");
      if (server) {
        server.emit("exit", 1, null);
      }
    });
  }

  return child;
};

process.exit = (code) => {
  exitCalls.push(typeof code === "number" ? code : 0);
};

require(path.join(process.cwd(), "scripts/runtime/collector-bootstrap.js"));

setTimeout(() => {
  const report = {
    spawnCount: spawned.length,
    serverKillCalls: killCalls.filter((entry) => entry.name === "server").length,
    collectorKillCalls: killCalls.filter((entry) => entry.name === "collector").length,
    exitCalls
  };
  process.stdout.write(JSON.stringify(report));
}, 50);
        `,
      ],
      {
        cwd: DASHBOARD_ROOT,
        env: {
          ...process.env,
          USAGE_COLLECTOR_SHUTDOWN_GRACE_MS: "25",
        },
        encoding: "utf8",
      }
    );

    const reportLine = harnessResultRaw
      .trim()
      .split("\n")
      .findLast((line) => line.trim().startsWith("{"));
    if (!reportLine) {
      throw new Error(`missing harness JSON report: ${harnessResultRaw}`);
    }

    const harnessResult = JSON.parse(reportLine) as {
      spawnCount: number;
      serverKillCalls: number;
      collectorKillCalls: number;
      exitCalls: number[];
    };

    expect(harnessResult.spawnCount).toBe(2);
    expect(harnessResult.collectorKillCalls).toBe(1);
    expect(harnessResult.exitCalls.length).toBe(1);
    expect(harnessResult.exitCalls[0]).toBe(1);
  });

  it("proves default coordinator mode spawns both children and shuts down cleanly on SIGTERM", () => {
    ensureServerEntrypointFixture();
    const harnessResultRaw = execFileSync(
      "node",
      [
        "-e",
        `
const cp = require("node:child_process");
const { EventEmitter } = require("node:events");
const path = require("node:path");

const spawned = [];
const killCalls = [];
const exitCalls = [];

function createChild(name) {
  const child = new EventEmitter();
  child.killed = false;
  child.exitCode = null;
  child.kill = (signal) => {
    killCalls.push({ name, signal });
    child.killed = true;
    child.exitCode = signal === "SIGTERM" ? 0 : 1;
    setImmediate(() => child.emit("exit", child.exitCode, null));
    return true;
  };
  return child;
}

cp.spawn = (command, args) => {
  const name = spawned.length === 0 ? "server" : "collector";
  const child = createChild(name);
  spawned.push({ name, command, args });
  return child;
};

process.exit = (code) => {
  exitCalls.push(typeof code === "number" ? code : 0);
};

require(path.join(process.cwd(), "scripts/runtime/collector-bootstrap.js"));
setImmediate(() => process.emit("SIGTERM"));

setTimeout(() => {
  const report = {
    spawned,
    serverKillCalls: killCalls.filter((entry) => entry.name === "server").length,
    collectorKillCalls: killCalls.filter((entry) => entry.name === "collector").length,
    exitCalls
  };
  process.stdout.write(JSON.stringify(report));
}, 50);
        `,
      ],
      {
        cwd: DASHBOARD_ROOT,
        env: {
          ...process.env,
          USAGE_COLLECTOR_SHUTDOWN_GRACE_MS: "25",
        },
        encoding: "utf8",
      }
    );

    const reportLine = harnessResultRaw
      .trim()
      .split("\n")
      .findLast((line) => line.trim().startsWith("{"));
    if (!reportLine) {
      throw new Error(`missing harness JSON report: ${harnessResultRaw}`);
    }

    const harnessResult = JSON.parse(reportLine) as {
      spawned: Array<{ name: string; command: string; args: string[] }>;
      serverKillCalls: number;
      collectorKillCalls: number;
      exitCalls: number[];
    };

    expect(harnessResult.spawned.length).toBe(2);
    expect(harnessResult.spawned[0]?.args?.[0]?.endsWith("server.js")).toBe(true);
    expect(harnessResult.spawned[1]?.args?.[0]?.endsWith("collector-bootstrap.js")).toBe(true);
    expect(harnessResult.spawned[1]?.args?.[1]).toBe("--collector");
    expect(harnessResult.serverKillCalls).toBe(1);
    expect(harnessResult.collectorKillCalls).toBe(1);
    expect(harnessResult.exitCalls).toEqual([0]);
  });
});

function ensureServerEntrypointFixture(): void {
  const fixtureServerEntry = path.join(DASHBOARD_ROOT, "server.js");
  if (fs.existsSync(fixtureServerEntry)) {
    return;
  }

  fs.writeFileSync(fixtureServerEntry, "process.exit(0);\n", "utf8");
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  timeoutMessage: string
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(timeoutMessage);
}
