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
