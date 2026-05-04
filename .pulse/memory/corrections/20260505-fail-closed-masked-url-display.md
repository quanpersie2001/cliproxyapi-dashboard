---
date: 2026-05-05
feature: oauth-config-ui-ux
severity: critical
tags: [oauth, security, masking]
applies_when: deriving a UI-visible masked URL or other secret-bearing display string from stored configuration text
scope: [dashboard/src/lib/providers/oauth-ops.ts, dashboard/src/lib/__tests__/oauth-ops.test.ts]
signals: [masking logic slices raw strings, malformed userinfo contains multiple @ characters, display contract assumes masking always succeeds]
---

# Correction: Fail Closed When Masking Secret-Bearing URLs

**Why this exists:** Best-effort masking of malformed proxy URLs can still leak credential fragments into UI-visible data.

## Wrong move

Treating the first `@` in a raw URL string as authoritative and then returning a masked-looking value assumes the stored URL is already canonical. For inputs like `socks5://user:p@ss@proxy-us:1080`, that string-slicing approach can leave part of the original secret in the returned display string.

## Correct move

Parse and normalize the secret-bearing URL with a strategy that can prove the displayed authority is safe. If parsing, normalization, or masking is ambiguous, omit the display field entirely instead of returning a best-effort masked string.

## Evidence

- Feature: `oauth-config-ui-ux`
- Files / commands / artifacts:
  - `dashboard/src/lib/providers/oauth-ops.ts`
  - `dashboard/src/lib/__tests__/oauth-ops.test.ts`
  - `.beads/issues.jsonl` (`br-kez`)
  - `.pulse/findings/learnings-candidates.md`

## Propagation

**Propagation:** correction
**Planner action:** attach this file in bead `learning_refs` when a bead adds masked display summaries from stored URLs, proxy strings, or other credentials-bearing config.
