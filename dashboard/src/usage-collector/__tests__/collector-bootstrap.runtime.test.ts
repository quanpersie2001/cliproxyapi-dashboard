import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const DASHBOARD_ROOT = path.resolve(__dirname, "../../..");

const childProcesses: Array<ReturnType<typeof spawn>> = [];

afterEach(() => {
  while (childProcesses.length > 0) {
    const child = childProcesses.pop();
    if (!child || child.killed) {
      continue;
    }
    child.kill("SIGKILL");
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
        10_000,
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
});

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
