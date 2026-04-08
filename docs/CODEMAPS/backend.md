<!-- Updated for proxy-only control-plane -->
# Backend (API Routes)

## Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`

## Admin

- `GET|POST|DELETE /api/admin/users`
- `GET|PUT /api/admin/settings`
- `GET|DELETE /api/admin/logs`
- `GET|POST /api/admin/deploy`
- `POST /api/admin/revoke-sessions`
- `GET|PUT|POST /api/admin/telegram`

## Providers

- `GET|POST /api/providers/keys`
- `DELETE /api/providers/keys/[keyHash]`
- `GET|POST /api/providers/oauth`
- `DELETE|PATCH /api/providers/oauth/[id]`
- `POST /api/providers/oauth/claim`
- `POST /api/providers/oauth/import`

## Custom Providers

- `GET|POST /api/custom-providers`
- `PATCH /api/custom-providers/[id]`
- `POST /api/custom-providers/fetch-models`
- `PUT /api/custom-providers/reorder`

## Provider Groups

- `GET|POST /api/provider-groups`
- `PATCH|DELETE /api/provider-groups/[id]`
- `PUT /api/provider-groups/reorder`

## User Access

- `GET|POST|DELETE /api/user/api-keys`

## Quota And Usage

- `GET /api/quota`
- `POST /api/quota/check-alerts`
- `POST /api/usage/collect`
- `GET /api/usage/history`

## Runtime And Operations

- `GET /api/health`
- `GET|POST /api/setup`
- `GET /api/setup-status`
- `POST /api/restart`
- `GET|POST /api/update/*`
- `GET /api/proxy/status`
- `GET /api/proxy/oauth-settings`
- `GET|POST|PUT|PATCH|DELETE /api/management/[...path]`
- `GET /api/containers/list`
- `POST /api/containers/[name]/action`

## Shared Utilities

- `lib/errors.ts`: canonical API envelopes
- `lib/db.ts`: Prisma singleton
- `lib/api-endpoints.ts`: centralized route constants
- `lib/validation/schemas.ts`: active Zod request schemas
- `lib/providers/*`: dual-write provider orchestration
- `lib/containers.ts`: allowlisted Docker container operations
