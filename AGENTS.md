# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-09T03:00:00Z  
**Commit:** working-tree  
**Branch:** main

## OVERVIEW
CLIProxyAPI Dashboard monorepo: Next.js 16/React 19 control plane for CLIProxyAPI, focused on proxy administration only.
Primary operational boundaries are `apps/dashboard/` (app/API) and `infrastructure/` (compose stack, config, ops docs).

## STRUCTURE
```text
cliproxyapi-dashboard/
├── apps/dashboard/      # Next.js app, API routes, Prisma, auth, provider sync
├── infrastructure/      # Production compose stack, proxy config, UFW/docs, env-driven ops
├── docs/                # Installation, config, security, troubleshooting, codemaps
├── docker-compose.local.yml
├── setup-local.sh
├── setup-local.ps1
└── install.sh
```

## WHERE TO LOOK
| Task | Location | Notes |
|---|---|---|
| Auth/session bugs | `apps/dashboard/src/lib/auth/*`, `apps/dashboard/src/app/api/auth/*` | JWT + session DAL split |
| Provider key/OAuth flows | `apps/dashboard/src/lib/providers/*`, `apps/dashboard/src/app/api/providers/*` | Ownership + dual-write rules |
| Quota/usage behavior | `apps/dashboard/src/app/api/quota/route.ts`, `apps/dashboard/src/app/api/usage/*` | `/api/usage` is deprecated |
| Container/update actions | `apps/dashboard/src/app/api/containers/*`, `apps/dashboard/src/app/api/update/*` | Docker proxy constrained |
| Local bootstrap issues | `setup-local.sh`, `apps/dashboard/dev-local.sh` | Migration bootstrap/drift recovery logic |
| Production stack issues | `infrastructure/docker-compose.yml`, `infrastructure/config/*` | Loopback-bound dashboard/proxy, internal DB network |

## CODE MAP
| Symbol | Type | Location | Role |
|---|---|---|---|
| `GET` | API handler | `apps/dashboard/src/app/api/quota/route.ts` | Quota aggregation + provider-specific parsing |
| `AsyncMutex` | Class | `apps/dashboard/src/lib/providers/management-api.ts` | In-process provider operation lock |
| `DashboardOverviewPage` | Page function | `apps/dashboard/src/app/dashboard/page.tsx` | Proxy-only overview/status cards |
| `apiError` | Function | `apps/dashboard/src/lib/errors.ts` | Canonical error envelope |
| `API_ENDPOINTS` | Const map | `apps/dashboard/src/lib/api-endpoints.ts` | Centralized route literals |

## CONVENTIONS
- TypeScript strict mode on; path alias `@/* -> ./src/*`.
- Next.js App Router + route handlers under `src/app/api/**/route.ts`.
- API route strings must come from `API_ENDPOINTS` (no hardcoded URL literals).
- API error responses should use `apiError`/`apiSuccess` style wrappers.
- Prisma generation is wired into predev/prebuild/pretest scripts.
- ESLint flat config (`eslint.config.mjs`); no Prettier config present.

## ANTI-PATTERNS (THIS PROJECT)
- Do not treat `providerMutex` as distributed lock; it is single-process only.
- Do not add new consumers of deprecated `/api/usage`; use `/api/usage/history`.
- Do not hardcode API URLs or secrets.
- Do not edit Prisma generated internals (`apps/dashboard/src/generated/prisma/internal/*`).
- Do not enable UFW before allowing SSH in server setup docs/scripts.

## UNIQUE STYLES
- Security headers/CSP configured in `apps/dashboard/next.config.ts` with env-aware strictness.
- Release flow is manual `workflow_dispatch` with release-please + multi-arch digest merge.
- Local dev bootstrap has explicit migration drift repair for known Prisma state.

## COMMANDS
```bash
# app dev/test/build
cd apps/dashboard
npm run dev
npm run typecheck
npm run test
npm run build

# local stack
./setup-local.sh
cd apps/dashboard && ./dev-local.sh

# production stack
cd infrastructure
docker compose up -d
```

## NOTES
- Repo includes generated analysis artifacts (`ENTRY_POINTS.md`, `DOMAIN_MAP.md`, etc.); treat as reference, not source of truth over code.
- Prisma migrations still contain some legacy history; prefer current app code and current schema/doc files when reasoning about active architecture.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **cliproxyapi-dashboard** (6598 symbols, 11002 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/cliproxyapi-dashboard/context` | Codebase overview, check index freshness |
| `gitnexus://repo/cliproxyapi-dashboard/clusters` | All functional areas |
| `gitnexus://repo/cliproxyapi-dashboard/processes` | All execution flows |
| `gitnexus://repo/cliproxyapi-dashboard/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

<!-- PULSE:START -->
# Pulse Workflow

Use `pulse:using-pulse` first in this repo unless you are resuming an already approved Pulse handoff.

## What Pulse Is / Is Not

Pulse is a validate-first, docs-first skill workflow for Claude Code and Codex.
Pulse is not a license to skip `CONTEXT.md`, validating, review gates, or human approval.

## One-Line Glossary

- `CONTEXT.md` — locked decisions downstream work must honor.
- `phase-plan.md` — the whole-feature slice plan.
- phase contract — the current phase's proof and exit conditions.
- story map — the reason beads are sequenced the way they are.
- bead — one worker-sized unit of work with exact files and checks.
- handoff — the pause/resume contract for the next actor.
- `pulse_status` — the read-only scout for current workflow state.

## Startup

1. Read this file at session start and again after any context compaction.
2. If `.pulse/onboarding.json` is missing or outdated, stop and run `pulse:using-pulse` before continuing.
3. If `.pulse/scripts/pulse_status.mjs` exists, use `node .pulse/scripts/pulse_status.mjs --json` for a fast read-only status snapshot.
4. If `.pulse/handoffs/manifest.json` exists, do not auto-resume. Surface the saved state and wait for user confirmation.
5. If `.pulse/memory/critical-patterns.md` exists, read it before planning or execution work.

## Chain

```
pulse:preflight
  → pulse:using-pulse
  → pulse:exploring
  → pulse:planning
  → pulse:validating
  → pulse:swarming
  → pulse:executing
  → pulse:reviewing
  → pulse:compounding
```

## Critical Rules

1. Never execute without validating.
2. `CONTEXT.md` is the source of truth for locked decisions.
3. If context usage passes roughly 65%, write `.pulse/handoffs/manifest.json` and pause cleanly.
4. Treat `.pulse/state.json` as the routing mirror and `.pulse/STATE.md` as the human-readable narrative; keep them aligned.
5. After compaction, re-read `AGENTS.md`, run `node .pulse/scripts/pulse_status.mjs --json` if present, then re-open `.pulse/handoffs/manifest.json`, `.pulse/state.json`, `.pulse/STATE.md`, and the active feature context before more work.
6. P1 review findings block merge.

## 3-Plane Model

1. **Control plane — `.pulse/`**: live workflow state, routing mirrors, handoffs, and operator surfaces.
2. **Memory plane — `.pulse/memory/`**: shared root for reusable cross-feature memory, including critical patterns, learnings, corrections, and ratchet artifacts.
3. **Feature record plane — `history/`**: feature-specific decisions, plans, contracts, story maps, and durable narrative.

## Working Files

```
.pulse/
  onboarding.json     ← onboarding state for the Pulse plugin
  state.json          ← machine-readable routing/status mirror
  STATE.md            ← current phase and focus
  handoffs/
    manifest.json     ← pause/resume artifact
  memory/             ← shared reusable memory root
    critical-patterns.md ← globally promoted patterns
    learnings/          ← durable cross-feature learning entries
    corrections/        ← durable corrections to prior guidance
    ratchet/            ← durable quality bars and non-regression rules

history/<feature>/
  CONTEXT.md          ← locked decisions
  discovery.md        ← research findings
  approach.md         ← approach + risk map

.beads/               ← bead/task files when beads are in use
.spikes/              ← spike outputs when validation requires them
```

## Operator Cookbook

### Startup scout

1. Run `pulse:using-pulse` if onboarding is missing or stale.
2. Run `node .pulse/scripts/pulse_status.mjs --json` when available.
3. Use the scout to choose the next artifact instead of opening everything at once.

### Resume scout

- If `.pulse/handoffs/manifest.json` exists, surface it and wait for explicit confirmation.
- Re-open the handoff plus `.pulse/state.json` and `.pulse/STATE.md` before continuing.
- If current state and a handoff disagree, surface the mismatch instead of guessing.

### Swarm vs single-worker

- Use swarm when the current phase has enough parallelizable beads to justify coordination overhead.
- Use single-worker when Pulse discipline is still needed but parallelism is not.
- Gate 3 still blocks both modes until validating approves execution.

## Codex Guardrails

- Repo-local `.codex/` files installed by Pulse are workflow guardrails, not optional decoration.
- Use `node .pulse/scripts/pulse_status.mjs --json` as the preferred quick scout step when it is available.
- Treat `compact_prompt` recovery instructions as mandatory.
- Use `bv` only with `--robot-*` flags. Bare `bv` launches the TUI and should be avoided in agent sessions.
- If the repo is only partially onboarded, stay in bootstrap/planning mode and surface what is missing before implementation.

## Session Finish

Before ending a substantial Pulse work chunk:

1. Update or close the active bead/task if one exists.
2. Leave `.pulse/state.json`, `.pulse/STATE.md`, and `.pulse/handoffs/` consistent with the current pause/resume state.
3. Mention any remaining blockers, open questions, or next actions in the final response.
<!-- PULSE:END -->
