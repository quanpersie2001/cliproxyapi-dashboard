---
date: 2026-05-04
feature: oauth-config-ui-ux
categories: [pattern, decision]
severity: critical
tags: [oauth, config, review, pulse]
applies_when: working on a full-file config editor or creating a new execution bead from a review finding in this repo family
scope: [dashboard/src/lib/providers/oauth-auth-file-settings.ts, .beads/issues.jsonl]
signals: [hidden fields disappear after unrelated edits, review bead exists as prose without files or verify fields]
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
