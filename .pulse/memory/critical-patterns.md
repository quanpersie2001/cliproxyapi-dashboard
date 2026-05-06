## [20260504] Preserve Hidden Keys In Full-File Editors
**Category:** pattern
**Feature:** oauth-config-ui-ux
**Tags:** [oauth, config, payload]

Phase 1 narrowed the OAuth modal surface, but the first pass still saved the entire auth file from a sanitized visible-only object and silently deleted hidden runtime keys like `excluded_models`, `disable_cooling`, and `websocket` or `websockets`. When a UI hides fields but still persists the full document, preserve non-editable keys in the backing object and add a round-trip test that edits only visible fields while proving hidden keys survive unchanged.

**Full entry:** .pulse/memory/learnings/20260504-oauth-full-file-preservation.md

## [20260505] Surface Loss Windows On Destructive Pulls
**Category:** failure
**Feature:** usage-queue-ingestion
**Tags:** [queue, durability, reliability]

Phase 2 review found that a destructive RESP pop followed by failed inbox persistence was initially treated like ordinary dropped-count math, which hid a real loss window after upstream data was already removed. When a source pull is destructive and the first durable boundary is local, store failure is a boundary violation, not a normal drop: fail closed and surface explicit operator-visible metadata such as the pulled count, persisted count, and an open loss-window signal.

**Full entry:** .pulse/memory/learnings/20260505-ingestion-identity-hardening.md
