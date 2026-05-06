import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("dashboard Docker runtime layout", () => {
  it("copies Next static assets into the standalone server root", () => {
    const dockerfilePath = path.resolve(__dirname, "../../../Dockerfile");
    const dockerfile = fs.readFileSync(dockerfilePath, "utf8");

    expect(dockerfile).toContain(
      "COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./app/.next/static"
    );
    expect(dockerfile).not.toContain(
      "COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static"
    );
  });

  it("installs the musl SWC binary required by Next standalone builds on Alpine", () => {
    const dockerfilePath = path.resolve(__dirname, "../../../Dockerfile");
    const dockerfile = fs.readFileSync(dockerfilePath, "utf8");

    expect(dockerfile).toContain("@next/swc-linux-arm64-musl@${NEXT_VERSION}");
    expect(dockerfile).toContain("@next/swc-linux-x64-musl@${NEXT_VERSION}");
  });
});
