# Contributing

Canonical docs hub: [`docs/README.md`](docs/README.md)

## Prerequisites

- Node.js 20+
- npm
- Docker Desktop or Docker Engine + Compose plugin
- Git

## Workspace Status

The repository uses a workspace layout with the active app in [`apps/dashboard/`](apps/dashboard/), a standalone worker workspace under `workers/`, and shared modules under `packages/`.

Root scripts are convenience entrypoints that proxy into `apps/dashboard`, including `npm run build:collector` for collector-runtime build output.

`apps/dashboard/src/server/jobs/workers/usage-collector/` remains the embedded runtime source boundary packaged into the dashboard image, while `workers/usage-collector/` is kept as a separate workspace boundary for worker artifacts and local experiments. Keep shared contracts/modules in `packages/*`. 

## Recommended Development Workflow

Use the source-dev scripts from [`apps/dashboard/`](apps/dashboard/):

```bash
cd apps/dashboard
./tools/dev/dev-local.sh
```

Windows:

```powershell
cd apps/dashboard
.\tools\dev\dev-local.ps1
```

This gives you:

- dashboard on `http://localhost:3000`
- proxy API on `http://localhost:28317`
- PostgreSQL on `localhost:5433`

For a quick smoke test of the published images instead of source development, use the root appliance setup:

```bash
./setup-local.sh
```

## Dashboard npm Scripts

Preferred from repo root (delegates to `apps/dashboard`):

```bash
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run build:collector
```

Direct execution in [`apps/dashboard/`](apps/dashboard/) is also valid:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run typecheck` | Regenerate Prisma client and run `tsc --noEmit` |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest suite |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run build` | Build the production Next.js app |
| `npm run migrate:provider-ownership` | Run the provider ownership migration helper |

## Project Rules That Matter

- TypeScript strict mode is enabled.
- Use `API_ENDPOINTS` from [`apps/dashboard/src/lib/api-endpoints.ts`](apps/dashboard/src/lib/api-endpoints.ts) instead of hardcoded route strings in the app.
- Use `apiError`, `apiSuccess`, or `Errors.*` from [`apps/dashboard/src/lib/errors.ts`](apps/dashboard/src/lib/errors.ts) for API responses.
- Do not add new consumers of the deprecated `GET /api/usage` route; use `GET /api/usage/history`.
- Do not treat `providerMutex` as a distributed lock.
- Do not edit generated Prisma internals under `apps/dashboard/src/server/db/generated/prisma/internal/`.
- Keep secrets and API URLs out of source control.

## Testing Checklist

Before opening a PR, run:

```bash
cd apps/dashboard
npm run typecheck
npm run lint
npm test
npm run build
```

Also verify any touched runtime scripts with a syntax check when relevant.

## Release Flow

Releases are manual:

- trigger [`release.yml`](.github/workflows/release.yml) with `workflow_dispatch`
- Release Please manages the release PR/tag flow and auto-dispatches [`publish.yml`](.github/workflows/publish.yml) when tag-push fan-out is unavailable
- dashboard images are built natively for `amd64` on `ubuntu-latest` and `arm64` on `ubuntu-24.04-arm`
- `version.json` is refreshed for dashboard-side update checks

## Documentation Expectations

If you change runtime behavior, update the docs in [`docs/`](docs/) in the same change set.
