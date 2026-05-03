import { describe, expect, it } from "vitest";
import {
  calcOverallCapacity,
  calcProviderSummary,
  countLowCapacityProviders,
  type ProviderSummary,
  type QuotaAccount,
} from "./quota-metrics";

function createAccount(
  provider: string,
  groups: Array<{ id: string; label: string; remainingFraction: number | null }>,
  overrides: Partial<QuotaAccount> = {}
): QuotaAccount {
  return {
    auth_index: overrides.auth_index ?? `${provider}-0`,
    provider,
    email: overrides.email ?? `${provider}@example.com`,
    supported: overrides.supported ?? true,
    plan: overrides.plan,
    error: overrides.error,
    raw: overrides.raw,
    groups: groups.map((group) => ({
      ...group,
      resetTime: null,
      models: [
        {
          id: group.id,
          displayName: group.label,
          remainingFraction: group.remainingFraction,
          resetTime: null,
        },
      ],
    })),
  };
}

function createSummary(overrides: Partial<ProviderSummary> & Pick<ProviderSummary, "provider">): ProviderSummary {
  return {
    provider: overrides.provider,
    totalAccounts: overrides.totalAccounts ?? 1,
    healthyAccounts: overrides.healthyAccounts ?? 1,
    errorAccounts: overrides.errorAccounts ?? 0,
    windowCapacities: overrides.windowCapacities ?? [],
    longTermMin: overrides.longTermMin ?? null,
    shortTermMin: overrides.shortTermMin ?? null,
    effectiveCapacity: overrides.effectiveCapacity ?? null,
    hasLongTermWindows: overrides.hasLongTermWindows ?? false,
  };
}

describe("quota metrics", () => {
  it("keeps pooled per-window capacity unchanged across accounts", () => {
    const summary = calcProviderSummary([
      createAccount("claude", [
        { id: "seven-day", label: "7d Weekly", remainingFraction: 0.4 },
      ], { auth_index: "claude-1" }),
      createAccount("claude", [
        { id: "seven-day", label: "7d Weekly", remainingFraction: 0.5 },
      ], { auth_index: "claude-2" }),
    ]);

    expect(summary.windowCapacities).toHaveLength(1);
    expect(summary.windowCapacities[0]?.capacity).toBeCloseTo(0.7, 5);
  });

  it("treats long-term windows as the effective quota gate", () => {
    const summary = calcProviderSummary([
      createAccount("claude", [
        { id: "seven-day", label: "7d Weekly", remainingFraction: 0 },
        { id: "five-hour", label: "5h Session", remainingFraction: 1 },
      ]),
    ]);

    expect(summary.longTermMin).toBe(0);
    expect(summary.shortTermMin).toBe(1);
    expect(summary.effectiveCapacity).toBe(0);
    expect(summary.hasLongTermWindows).toBe(true);
  });

  it("falls back to short-term quota when no long-term windows exist", () => {
    const summary = calcProviderSummary([
      createAccount("codex", [
        { id: "primary-window", label: "5h Window", remainingFraction: 0.8 },
        { id: "secondary-window", label: "5m Window", remainingFraction: 0.4 },
      ]),
    ]);

    expect(summary.longTermMin).toBeNull();
    expect(summary.shortTermMin).toBe(0.4);
    expect(summary.effectiveCapacity).toBe(0.4);
    expect(summary.hasLongTermWindows).toBe(false);
  });

  it("weights overall capacity by healthy account count using effective capacity", () => {
    const overall = calcOverallCapacity([
      createSummary({ provider: "claude", healthyAccounts: 3, effectiveCapacity: 0.8, hasLongTermWindows: true }),
      createSummary({ provider: "codex", healthyAccounts: 1, effectiveCapacity: 0.2, hasLongTermWindows: false }),
    ]);

    expect(overall.value).toBeCloseTo(0.65, 5);
  });

  it("counts low-capacity providers from effective capacity instead of any individual window", () => {
    const count = countLowCapacityProviders([
      createSummary({
        provider: "claude",
        effectiveCapacity: 0.5,
        hasLongTermWindows: true,
        longTermMin: 0.5,
        shortTermMin: 0.1,
        windowCapacities: [
          { id: "seven-day", label: "7d Weekly", capacity: 0.5, resetTime: null, isShortTerm: false },
          { id: "five-hour", label: "5h Session", capacity: 0.1, resetTime: null, isShortTerm: true },
        ],
      }),
      createSummary({
        provider: "codex",
        effectiveCapacity: 0.1,
        hasLongTermWindows: false,
        shortTermMin: 0.1,
      }),
    ]);

    expect(count).toBe(1);
  });
});
