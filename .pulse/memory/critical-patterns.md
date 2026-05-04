## [20260504] Preserve Hidden Keys In Full-File Editors
**Category:** pattern
**Feature:** oauth-config-ui-ux
**Tags:** [oauth, config, payload]

Phase 1 narrowed the OAuth modal surface, but the first pass still saved the entire auth file from a sanitized visible-only object and silently deleted hidden runtime keys like `excluded_models`, `disable_cooling`, and `websocket` or `websockets`. When a UI hides fields but still persists the full document, preserve non-editable keys in the backing object and add a round-trip test that edits only visible fields while proving hidden keys survive unchanged.

**Full entry:** .pulse/memory/learnings/20260504-oauth-full-file-preservation.md
