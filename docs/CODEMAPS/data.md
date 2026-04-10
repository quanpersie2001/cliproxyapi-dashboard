<!-- Updated for proxy-only control-plane -->
# Data Model

## Active Models

```text
User
  ├── UserApiKey
  ├── ProviderKeyOwnership
  ├── ProviderOAuthOwnership
  ├── CustomProvider
  ├── ProviderGroup
  ├── AuditLog
  └── UsageRecord

CustomProvider
  ├── CustomProviderModel
  └── CustomProviderExcludedModel

ProviderGroup
  └── CustomProvider

SystemSetting
CollectorState
```

## Main Responsibilities

- `User`: dashboard identity and admin status
- `UserApiKey`: client credentials issued by the dashboard
- `ProviderKeyOwnership`: who owns which provider API keys
- `ProviderOAuthOwnership`: who owns imported or connected OAuth accounts
- `CustomProvider`: user-managed OpenAI-compatible upstreams
- `CustomProviderModel`: alias mappings for upstream models
- `CustomProviderExcludedModel`: deny-list patterns per custom provider
- `ProviderGroup`: grouping and ordering for custom providers
- `UsageRecord`: persistent usage history collected from the proxy
- `AuditLog`: security and admin trail
- `SystemSetting`: global dashboard settings such as provider quotas and limits
- `CollectorState`: usage-collector bookkeeping

## Notes

- The Prisma schema may still contain some legacy tables from older feature sets.
- The active dashboard surface is proxy-only and no longer exposes the legacy non-proxy workflows from older releases.
