# CONTEXT: CLIProxyAPI Dashboard

## Purpose

CLIProxyAPI Dashboard là proxy-only control plane cho CLIProxyAPIPlus. Repo này cung cấp dashboard web để quản lý người dùng dashboard, API keys, provider credentials/OAuth, runtime settings, usage history, quota views, logs, update workflows, và các thao tác container an toàn.

Dashboard không nằm trên hot path inference `/v1/*`; inference traffic đi thẳng vào CLIProxyAPI runtime.

## System Shape

Repo có hai boundary chính:

1. `apps/dashboard/` — ứng dụng Next.js 16 / React 19, App Router, API routes, Prisma, auth/session, và các feature UI.
2. `infrastructure/` — production compose stack, runtime config, reverse proxy template, backup/restore, và helper scripts vận hành.

Bundled deployment chạy bốn service Docker:

- `dashboard` — UI + authenticated API routes
- `cliproxyapi` — proxy runtime + management API
- `postgres` — persistent store
- `docker-proxy` — Docker socket proxy bị allowlist chặt

## Runtime and Entry Paths

Các entry path chính:

- `/` redirect sang `/dashboard`
- `apps/dashboard/src/app/dashboard/layout.tsx` bắt buộc session; thiếu session thì redirect `/login`
- `POST /api/auth/login` xử lý login, rate limit, ký JWT, và set cookie session
- `GET|POST|PUT|PATCH|DELETE /api/management/[...path]` là lớp passthrough an toàn sang CLIProxyAPI management API
- `GET /api/usage/history` đọc usage history đã persist trong Postgres
- `GET /api/quota` fan-out sang provider/runtime APIs để tổng hợp quota live

Hai workflow runtime chính:

- **Local appliance**: `./setup-local.sh` dựng cả stack bằng `docker-compose.local.yml`
- **Source development**: `cd apps/dashboard && ./tools/dev/dev-local.sh` chạy Postgres + CLIProxyAPI bằng Docker, apply Prisma migrations, rồi chạy Next.js dev server

## Source of Truth

- `README.md` — overview, deploy modes, quick start, release model
- `docs/ARCHITECTURE.md` — runtime topology, module boundaries, API/data overview
- `apps/dashboard/prisma/schema.prisma` — source of truth cho data model hiện tại
- `apps/dashboard/src/app/api/management/[...path]/route.ts` — security boundary giữa dashboard và CLIProxyAPI management API
- `apps/dashboard/src/lib/api-endpoints.ts` — route literals dùng chung, tránh hardcode URL
- `infrastructure/docker-compose.yml` — production runtime topology và operational wiring
- `docker-compose.local.yml` — local appliance topology

## Build, Test, and Verification

Chạy từ `apps/dashboard/`:

- `npm run dev`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

Bootstrap workflows:

- `./setup-local.sh`
- `cd apps/dashboard && ./tools/dev/dev-local.sh`
- `cd infrastructure && ./manage.sh up`

## Constraints and Conventions

- Đây là **proxy-only** dashboard; không mở rộng tư duy thành general product control plane.
- Không thêm consumer mới cho `GET /api/usage`; code mới dùng `GET /api/usage/history`.
- Không hardcode API URLs; dùng constants trong `apps/dashboard/src/lib/api-endpoints.ts`.
- `providerMutex` là process-local lock, không phải distributed lock.
- Không sửa generated Prisma internals trong `apps/dashboard/src/server/db/generated/prisma/internal/*`.
- Dashboard phải giữ boundary bảo mật rõ với management API: allowlist path, validate origin, chống SSRF, giới hạn payload/response size.
- Production image chạy `apps/dashboard/scripts/runtime/entrypoint.sh` để `prisma migrate deploy` trước khi start server.

## External Integrations

- CLIProxyAPI / CLIProxyAPIPlus runtime và management API
- PostgreSQL 16 cho persistence
- Docker socket proxy cho container/image operations bị giới hạn
- GitHub / GHCR cho release metadata và dashboard image publish
- OAuth-capable provider ecosystems như Claude, Gemini, Codex, Antigravity, và upstream OpenAI-compatible providers

## Risks and Open Questions

- GitNexus index hiện trả về `CONTEXT.md` như một artifact trong query results; cần reindex nếu muốn index khớp tuyệt đối với filesystem mới.
- Chưa có repo-level ADRs; các quyết định kiến trúc bền vững hiện rải trong docs và source.
- Update/deploy webhook flow và custom-provider dual-write flow là hai vùng cần đọc sâu hơn nếu sắp sửa thay đổi hành vi ở đó.

## Next Reads

- `docs/FEATURES.md`
- `docs/CONFIGURATION.md`
- `apps/dashboard/src/lib/auth/session.ts`
- `apps/dashboard/src/app/api/auth/login/route.ts`
- `apps/dashboard/src/app/api/quota/route.ts`
- `apps/dashboard/src/app/api/usage/history/route.ts`
- `apps/dashboard/src/app/api/management/[...path]/route.ts`
- `apps/dashboard/tools/dev/dev-local.sh`
