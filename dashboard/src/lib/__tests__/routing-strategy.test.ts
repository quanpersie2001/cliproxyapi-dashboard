import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ROUTING_STRATEGY,
  isRoutingStrategy,
  ROUTING_STRATEGIES,
} from "@/lib/routing-strategy";
import { ManagementRoutingStrategySchema } from "@/lib/validation/schemas";

vi.mock("server-only", () => ({}));

describe("routing strategies", () => {
  it("only allows strategies supported by CLIProxyAPI", () => {
    expect(ROUTING_STRATEGIES).toEqual(["round-robin", "fill-first"]);
    expect(DEFAULT_ROUTING_STRATEGY).toBe("round-robin");
  });

  it("rejects legacy or unsupported strategy values", () => {
    expect(isRoutingStrategy("round-robin")).toBe(true);
    expect(isRoutingStrategy("fill-first")).toBe(true);
    expect(isRoutingStrategy("random")).toBe(false);
    expect(isRoutingStrategy("least-loaded")).toBe(false);
  });

  it("validates management API payloads for routing strategy", () => {
    expect(
      ManagementRoutingStrategySchema.safeParse({ value: "round-robin" }).success
    ).toBe(true);
    expect(
      ManagementRoutingStrategySchema.safeParse({ value: "fill-first" }).success
    ).toBe(true);
    expect(
      ManagementRoutingStrategySchema.safeParse({ value: "random" }).success
    ).toBe(false);
    expect(
      ManagementRoutingStrategySchema.safeParse({ value: "least-loaded" }).success
    ).toBe(false);
  });
});
