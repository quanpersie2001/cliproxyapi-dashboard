# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-09T03:00:00Z  
**Commit:** working-tree  
**Branch:** main

## OVERVIEW
CLIProxyAPI Dashboard monorepo: Next.js 16/React 19 control plane for CLIProxyAPIPlus, focused on proxy administration only.
Primary operational boundaries are `dashboard/` (app/API) and `infrastructure/` (compose stack, config, ops docs).

## STRUCTURE
```text
cliproxyapi-dashboard/
├── dashboard/           # Next.js app, API routes, Prisma, auth, provider sync
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
| Auth/session bugs | `dashboard/src/lib/auth/*`, `dashboard/src/app/api/auth/*` | JWT + session DAL split |
| Provider key/OAuth flows | `dashboard/src/lib/providers/*`, `dashboard/src/app/api/providers/*` | Ownership + dual-write rules |
| Quota/usage behavior | `dashboard/src/app/api/quota/route.ts`, `dashboard/src/app/api/usage/*` | `/api/usage` is deprecated |
| Container/update actions | `dashboard/src/app/api/containers/*`, `dashboard/src/app/api/update/*` | Docker proxy constrained |
| Local bootstrap issues | `setup-local.sh`, `dashboard/dev-local.sh` | Migration bootstrap/drift recovery logic |
| Production stack issues | `infrastructure/docker-compose.yml`, `infrastructure/config/*` | Loopback-bound dashboard/proxy, internal DB network |

## CODE MAP
| Symbol | Type | Location | Role |
|---|---|---|---|
| `GET` | API handler | `dashboard/src/app/api/quota/route.ts` | Quota aggregation + provider-specific parsing |
| `AsyncMutex` | Class | `dashboard/src/lib/providers/management-api.ts` | In-process provider operation lock |
| `DashboardOverviewPage` | Page function | `dashboard/src/app/dashboard/page.tsx` | Proxy-only overview/status cards |
| `apiError` | Function | `dashboard/src/lib/errors.ts` | Canonical error envelope |
| `API_ENDPOINTS` | Const map | `dashboard/src/lib/api-endpoints.ts` | Centralized route literals |

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
- Do not edit Prisma generated internals (`dashboard/src/generated/prisma/internal/*`).
- Do not enable UFW before allowing SSH in server setup docs/scripts.

## UNIQUE STYLES
- Security headers/CSP configured in `dashboard/next.config.ts` with env-aware strictness.
- Release flow is manual `workflow_dispatch` with release-please + multi-arch digest merge.
- Local dev bootstrap has explicit migration drift repair for known Prisma state.

## COMMANDS
```bash
# app dev/test/build
cd dashboard
npm run dev
npm run typecheck
npm run test
npm run build

# local stack
./setup-local.sh
cd dashboard && ./dev-local.sh

# production stack
cd infrastructure
docker compose up -d
```

## NOTES
- Repo includes generated analysis artifacts (`ENTRY_POINTS.md`, `DOMAIN_MAP.md`, etc.); treat as reference, not source of truth over code.
- Prisma migrations still contain some legacy history; prefer current app code and current schema/doc files when reasoning about active architecture.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **cliproxyapi-dashboard** (4794 symbols, 8422 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
