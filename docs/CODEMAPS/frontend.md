<!-- Updated for proxy-only control-plane -->
# Frontend

## Page Tree

```text
/
├── /login
├── /setup
└── /dashboard
    ├── /
    ├── /providers
    ├── /api-keys
    ├── /usage
    ├── /quota
    ├── /config
    ├── /settings
    ├── /monitoring
    ├── /containers
    └── /admin
        ├── /users
        └── /logs
```

## Main Areas

- `DashboardOverviewPage`: proxy health, counts, quick actions
- `ProvidersPage`: provider API keys, OAuth accounts, custom providers
- `ApiKeysPage`: dashboard-issued client credentials
- `UsagePage`: request analytics and history
- `QuotaPage`: provider quota insights and Telegram alerts
- `ProxyConfigPage`: runtime config fields backed by the management API
- `SettingsPage`: password, updates, provider limits, session revoke
- `MonitoringPage`: service status and logs
- `ContainersPage`: safe container actions

## Shared UI

- `DashboardNav`: sidebar navigation
- `DashboardHeader`: status and user header
- `components/providers/*`: provider-management UI
- `components/quota/*`: quota charts and alert controls
- `components/setup/*`: setup wizard
- `components/ui/*`: buttons, cards, dialogs, inputs, toasts

## State Management

- local `useState` / `useEffect`
- `fetch()` against `API_ENDPOINTS`
- route-level loading instead of a global client store

## Notes

- The dashboard UI is now limited to proxy administration flows.
