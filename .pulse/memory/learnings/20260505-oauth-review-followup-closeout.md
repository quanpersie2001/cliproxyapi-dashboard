---
date: 2026-05-05
feature: oauth-config-ui-ux
categories: [pattern, decision, failure]
severity: standard
tags: [oauth, review, testing, pulse]
applies_when: closing review-created follow-up beads that modify route or UI boundary contracts
scope: [dashboard/src/app/api/providers/oauth/route.test.ts, dashboard/src/components/providers/oauth-section.tsx, history/oauth-config-ui-ux/verification]
signals: [review follow-up beads exist, helper tests are green but route/ui contract proof is missing, closeout needs scoped commits and mirror sync]
---

# Learning: Execute Review Follow-Ups As First-Class Beads

**Category:** pattern
**Severity:** standard
**Tags:** [pulse, review, beads]
**Applicable-when:** Reviewing creates non-blocking follow-up debt that still changes runtime behavior or boundary verification.

## What Happened

Three review follow-up beads (`br-kez`, `br-obt`, `br-pp5`) were executed as independent work units with explicit file scope, verify commands, and dedicated evidence files (`history/oauth-config-ui-ux/verification/br-*.md`). Each bead was closed and committed atomically, then closeout mirrors were synchronized in a separate docs/state commit.

## Root Cause / Key Insight

Treating review debt as ad-hoc cleanup makes scope, verification, and audit history blur together. Running follow-ups through the same bead contract as normal execution preserves traceability and reduces closeout ambiguity.

## Recommendation for Future Work

When review findings need code changes, always convert them into executable beads with explicit `files`, `verify`, and `verification_evidence` before implementation. Keep one commit per bead and a separate closeout commit for lifecycle/mirror synchronization.

## Propagation Guidance

**Propagation:** planner-only
**Embed-in-bead-when:** A reviewer creates non-blocking follow-up items that will be executed after the main feature graph is closed.
**Bead hint:** Review follow-up work must be expressed as executable beads with scoped verify evidence and atomic commit boundaries.

---

# Learning: Boundary Contracts Need Route/UI-Level Proof

**Category:** failure
**Severity:** standard
**Tags:** [testing, route, ui]
**Applicable-when:** A change introduces repeated query forwarding or a local validation path that must abort before a network request.

## What Happened

Helper-level coverage for OAuth settings and masked proxy logic already existed, but review bead `br-pp5` still found missing boundary proofs. Adding `dashboard/src/app/api/providers/oauth/route.test.ts` and `dashboard/src/components/providers/oauth-section.save-settings.test.ts` closed two gaps: repeated `maskedProxyFor` forwarding, and invalid-header save abort before PATCH.

## Root Cause / Key Insight

Helper tests can pass while boundary contracts drift during small refactors. For fan-out query handling and early-return UI validation, behavior must be asserted at the boundary surface itself.

## Recommendation for Future Work

When a bead changes boundary behavior, require at least one route/UI-level regression that proves the user-visible contract directly. Do not accept helper-only coverage for this change shape.

## Propagation Guidance

**Propagation:** bead-local
**Embed-in-bead-when:** A bead touches route query fan-out, short-circuit validation, or request gating logic.
**Bead hint:** Add a direct boundary regression test in route/UI scope; helper tests alone are insufficient proof.

---

# Learning: HIGH Graph Risk Can Proceed Only With Fresh Boundary Evidence

**Category:** decision
**Severity:** standard
**Tags:** [gitnexus, risk, verification]
**Applicable-when:** `gitnexus_detect_changes` reports HIGH risk for a staged change that is still intended to be scoped and targeted.

## What Happened

During `br-pp5`, `gitnexus_detect_changes(scope=staged)` reported HIGH risk because touched symbols sit on central `OAuthSection` flows. The change still proceeded because targeted route/UI regressions and typecheck were run fresh and passed before closure.

## Root Cause / Key Insight

Graph-centrality risk is a warning, not an automatic veto. The safe path is to pair that warning with direct behavioral evidence for the exact boundary contracts being changed.

## Recommendation for Future Work

If staged risk is HIGH but scope is deliberate, pause and require explicit boundary verification (targeted tests + typecheck) before committing. Record the risk call and evidence path in closeout artifacts.

## Propagation Guidance

**Propagation:** planner-only
**Embed-in-bead-when:** A bead targets central symbols and impact analysis reports HIGH risk.
**Bead hint:** Treat HIGH risk as a mandatory verification escalation: require focused boundary tests and document the evidence before closeout.
