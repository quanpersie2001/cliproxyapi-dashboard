---
date: 2026-05-04
feature: oauth-config-ui-ux
categories: [pattern, decision, failure]
severity: critical
tags: [oauth, config, review, pulse, testing]
applies_when: working on a full-file config editor or capturing review-created follow-up execution and verification work in this repo family
scope: [dashboard/src/lib/providers/oauth-auth-file-settings.ts, dashboard/src/components/providers/oauth-section.tsx, dashboard/src/app/api/providers/oauth/route.ts, .beads/issues.jsonl]
signals: [hidden fields disappear after unrelated edits, untouched headers drift on note-only saves, repeated query params lack direct boundary coverage, review bead exists as prose without files or verify fields]
---

# Learning: Preserve Hidden Keys In Full-File Editors

**Category:** pattern
**Severity:** critical
**Tags:** [oauth, config, payload]
**Applicable-when:** A UI intentionally hides some config fields, but the save path still writes the entire underlying file or document.

## What Happened

Phase 1 narrowed the OAuth modal surface to `prefix`, `proxy_url`, `priority`, `headers`, and `note`, but `dashboard/src/lib/providers/oauth-auth-file-settings.ts` still serialized the full auth-file payload. The first implementation sanitized away `excluded_models`, `disable_cooling`, and `websocket` or `websockets` during load, so editing only `note` or `headers` silently deleted those hidden runtime settings on save. The regression was only caught during Gate 4 review and then locked down with `dashboard/src/lib/__tests__/oauth-auth-file-settings.test.ts`.

## Root Cause / Key Insight

The wrong assumption was that “removed from the editable contract” meant “safe to remove from the serialized backing object.” In a full-file editor, hidden fields are still part of the persistence contract unless the product explicitly introduces a migration. The safe pattern is to narrow the visible editor surface while preserving non-editable keys in the backing JSON that preview, dirty detection, and payload generation continue to use.

## Recommendation for Future Work

Always preserve non-editable keys in the backing object when a UI narrows a full-file editing surface. Add a round-trip regression test that edits only visible fields and proves hidden keys survive serialization unchanged.

## Propagation Guidance

**Propagation:** global-critical
**Embed-in-bead-when:** A bead changes a full-file editor, hides previously visible fields, or keeps preview and save semantics on a raw document boundary.
**Bead hint:** This editor still writes the whole file. Keep hidden keys in the backing object and add a round-trip preservation test before review.

---

# Learning: Review Follow-Up Beads Need Execution Schema Before Handoff

**Category:** decision
**Severity:** standard
**Tags:** [pulse, beads, review]
**Applicable-when:** A review finding becomes a new bead that will be handed back to `pulse:executing` instead of being fixed inline during the review pass.

## What Happened

`br-wpd.3` was created from a review P1 and initially existed as prose-only review debt. Before execution could proceed cleanly, the bead had to be upgraded with executable fields such as `files`, `verify`, `verification_evidence`, `testing_mode`, `tdd_steps`, and `decision_refs` so the fix path could follow the normal Pulse contract.

## Root Cause / Key Insight

Review beads created from findings are easy to under-specify because the problem statement feels obvious while the implementation contract is still missing. That gap pushes execution to guess scope or verification steps, which is exactly what Pulse is trying to avoid.

## Recommendation for Future Work

When creating a new bead from a review finding, write the same execution schema you would expect from planning before handing it to `pulse:executing`. Do not leave review debt as prose-only if another execution pass is required.

## Propagation Guidance

**Propagation:** planner-only
**Embed-in-bead-when:** A planner or reviewer turns a finding into a follow-up implementation bead.
**Bead hint:** Review follow-up beads must be executable, not just descriptive. Include file scope, verify steps, evidence path, and testing mode before execution resumes.

---

# Learning: Preserve Untouched Structured Subtrees In Full-File Editors

**Category:** failure
**Severity:** standard
**Tags:** [oauth, config, headers]
**Applicable-when:** A full-file editor parses a structured sub-object like `headers` into form state, but operators can save unrelated fields without editing that sub-object.

## What Happened

After `br-wpd.3` fixed hidden-key loss, review bead `br-obt` found a second full-file drift path in `dashboard/src/lib/providers/oauth-auth-file-settings.ts`. `sanitizeOAuthAuthFileJson()` normalized `headers` before the editor was even created, and `buildOAuthAuthFileSettingsPayload()` rewrote that normalized object back into the saved payload even when the operator changed only `note`, `prefix`, `proxy_url`, or `priority`. The runtime semantics might survive, but the full-file editor still mutated untouched config on an unrelated save.

## Root Cause / Key Insight

The implementation preserved the presence of the structured subtree but not the fidelity of the originally loaded parsed subtree. In full-file editors, “field is present” and “field was touched” are separate contracts. Untouched structured data should remain stable enough that unrelated saves do not create operator-unrequested config drift.

## Recommendation for Future Work

Track touched state for structured fields like `headers`, and when untouched preserve the originally loaded parsed subtree instead of rewriting it through a normalization path. Add a regression that edits an unrelated visible field and proves the untouched structured subtree stays stable.

## Propagation Guidance

**Propagation:** bead-local
**Embed-in-bead-when:** A bead changes parse/serialize behavior for a full-file editor that contains optional structured sub-objects.
**Bead hint:** This save path still writes the whole document. Preserve untouched structured subtrees unless the operator actually edited them, and add a note-only round-trip regression.

---

# Learning: Boundary Tests Need To Cover Route Fan-Out And Local Save Aborts

**Category:** failure
**Severity:** standard
**Tags:** [testing, route, ui]
**Applicable-when:** A feature adds repeated query-parameter route behavior or a client-side early-return validation path that prevents a request from being sent.

## What Happened

`br-wpd.4` and `br-wpd.1` locked helper-level behavior for masked proxy enrichment and headers JSON validation, and manual UAT proved the happy path, but review bead `br-pp5` still found two missing boundary proofs. There was no focused route test that repeated `maskedProxyFor` values were forwarded intact to `listOAuthWithOwnership()`, and no focused UI-level proof that invalid headers abort save before any PATCH request is sent. The code was readable, but the user-facing contract was still not locked down.

## Root Cause / Key Insight

Verification stayed too close to helper functions and manual checks. Additive boundary behavior can drift during small refactors even when lower-level helpers remain green, so helper coverage alone was not sufficient evidence for the real route and save contracts.

## Recommendation for Future Work

When adding route-level query contracts or local validation guards that short-circuit saves, add at least one focused boundary test at the route or UI layer in addition to helper tests. Treat “the helper is tested” as insufficient proof for user-facing boundary behavior.

## Propagation Guidance

**Propagation:** planner-only
**Embed-in-bead-when:** A planner or reviewer sees a bead that adds repeated query params, bounded route enrichment, or a validation path that returns before the network call.
**Bead hint:** Require one direct boundary test for the route or UI contract; helper-only coverage is not enough for this change shape.
