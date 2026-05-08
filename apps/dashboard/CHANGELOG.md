# Changelog

## [0.2.12](https://github.com/quanpersie2001/cliproxyapi-dashboard/compare/dashboard-v0.2.11...dashboard-v0.2.12) (2026-05-08)


### Bug Fixes

* fall back to model-only usage pricing ([e0faa91](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/e0faa91d66bad5ea12167025f7c951b6996c043b))

## [0.2.11](https://github.com/quanpersie2001/cliproxyapi-dashboard/compare/dashboard-v0.2.10...dashboard-v0.2.11) (2026-05-07)


### Bug Fixes

* normalize usage pricing lookup keys ([a37b40b](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/a37b40b22dff0b45a8f6ebcabd1923e44181a8cd))

## [0.2.10](https://github.com/quanpersie2001/cliproxyapi-dashboard/compare/dashboard-v0.2.9...dashboard-v0.2.10) (2026-05-07)


### Bug Fixes

* preload overview pricing for usage analytics ([b10a6b0](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/b10a6b0a16546f056bdd81e8fa8ffe4faed1843a))

## [0.2.9](https://github.com/quanpersie2001/cliproxyapi-dashboard/compare/dashboard-v0.2.8...dashboard-v0.2.9) (2026-05-07)


### Bug Fixes

* harden usage history and queue ingestion consistency ([#16](https://github.com/quanpersie2001/cliproxyapi-dashboard/issues/16)) ([9e9ade0](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/9e9ade06e83b53ab3aac81e3385ee682a8c29fc3))

## [0.2.8](https://github.com/quanpersie2001/cliproxyapi-dashboard/compare/dashboard-v0.2.7...dashboard-v0.2.8) (2026-05-06)


### Features

* add embedded usage queue ingestion ([#14](https://github.com/quanpersie2001/cliproxyapi-dashboard/issues/14)) ([5c9edef](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/5c9edef8c01db86c1bd48c559e2cacf002f1b89b))


### Bug Fixes

* **ui:** add overscroll-y-none to dashboard client layout ([91387a8](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/91387a8f8a73c5f96c763b03f56bb9b3d283e21d))

## [0.2.7](https://github.com/quanpersie2001/cliproxyapi-dashboard/compare/dashboard-v0.2.6...dashboard-v0.2.7) (2026-05-04)


### Features

* **br-kez:** fail-closed masked proxy handling for malformed userinfo with regression coverage ([ba1ea79](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/ba1ea79262e0be4987b7b80011de8f1f4fd41bdb))
* **br-obt:** preserve untouched OAuth headers subtree on non-header saves with regression coverage ([92cb648](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/92cb648acfc0d3da566b100d98d531585fd9c5b7))
* **br-pp5:** add route forwarding and invalid-headers save guard regression coverage ([875da5e](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/875da5e981172f3b47dd41b03b6d13044a031eea))
* **br-wpd.1:** narrowed OAuth auth-file settings contract and added Custom Headers validation ([a68a7d1](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/a68a7d1bbeb6bca9b8367c31c4676de7a5b997d2))
* **br-wpd.2:** rebuilt the OAuth settings modal into the approved split layout ([d394a06](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/d394a06b3d67b1f7a24b0917844b4e68257620bb))
* **br-wpd.3:** preserved hidden auth-file settings across OAuth modal save round-trips ([c77edd4](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/c77edd4e1dd239e3546fd3bbdfecde902451e0aa))
* **br-wpd.4:** add bounded masked OAuth proxy summary contract ([b2e25e8](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/b2e25e8e5b4fb5cfa8af2521fd5b0b8e604cc487))
* **br-wpd.5,br-wpd.7:** enrich oauth account signals and auth-index usage mapping ([88ededb](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/88ededb39e4782bc9d1ce0640f949bf8f309bc1f))
* **oauth:** collapse to single list API with raw auth payload for settings modal ([e023c3e](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/e023c3eded7023b28dd7770b78ebab57857afca7))
* **oauth:** improve per-account auth file UX ([aba8a04](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/aba8a04b5b75931c36916e087d7a028ddabf8093))
* **ui:** refine oauth settings modal layout and radius consistency ([bffce98](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/bffce983dd80a090752dfb2621473ca0bd154f26))
* **usage:** reorder ratio and expand service health panel ([31730fa](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/31730fa8d5c8e7ad15100893b7b3bdd033fac3fd))


### Bug Fixes

* align quota dashboard with usable capacity ([3af0cbb](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/3af0cbbdeebee44ae787a172ae605e79f7070e26))
* **usage:** clarify selected trend line colors ([bc7d8ac](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/bc7d8ac1e360253aec51849919039e99fb7a1f5b))

## [0.2.6](https://github.com/quanpersie2001/cliproxyapi-dashboard/compare/dashboard-v0.2.5...dashboard-v0.2.6) (2026-04-23)


### Bug Fixes

* **ui:** make dashboard status surfaces theme-aware ([52dc3eb](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/52dc3ebb028a786fe39de11805ae70678c87a9df))

## [0.2.5](https://github.com/quanpersie2001/cliproxyapi-dashboard/compare/dashboard-v0.2.4...dashboard-v0.2.5) (2026-04-20)


### Bug Fixes

* **dashboard:** refine UI surfaces and metric card formatting ([2e7c160](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/2e7c1602694b25cf2c127fea2efce762539f13f8))

## [0.2.4](https://github.com/quanpersie2001/cliproxyapi-dashboard/compare/dashboard-v0.2.3...dashboard-v0.2.4) (2026-04-13)


### Bug Fixes

* **infra:** resolve stale credentials and missing request body ([a1e741d](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/a1e741d88777248d4cb168b93c6510b24630ef36))

## [0.2.3](https://github.com/quanpersie2001/cliproxyapi-dashboard/compare/dashboard-v0.2.2...dashboard-v0.2.3) (2026-04-13)


### Features

* **dashboard:** add model pricing management and cost estimation ([26f77d6](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/26f77d616e6d1f3019946c02eb420c43bcfa960a))

## [0.2.2](https://github.com/quanpersie2001/cliproxyapi-dashboard/compare/dashboard-v0.2.1...dashboard-v0.2.2) (2026-04-12)


### Bug Fixes

* **docker:** include full Prisma runtime in dashboard image ([fb4532f](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/fb4532fd4d9a8aace9650196e6158f2e8f092221))

## [0.2.1](https://github.com/quanpersie2001/cliproxyapi-dashboard/compare/dashboard-v0.2.0...dashboard-v0.2.1) (2026-04-12)


### Features

* **install:** support one-file bootstrap without repo clone ([37ce5ba](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/37ce5ba7a365b3f92c68e96c01b8d7093c9dbc28))

## [0.2.0](https://github.com/quanpersie2001/cliproxyapi-dashboard/compare/dashboard-v0.1.1...dashboard-v0.2.0) (2026-04-12)


### ⚠ BREAKING CHANGES

* **dashboard:** Telegram quota alerts have been removed. Users relying on Telegram notifications for quota monitoring will need to check the dashboard quota page directly.

### Features

* **dashboard:** add model catalog with per-user exclusion preferences ([a104fdc](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/a104fdcd2c91636e5425fb65cf510e2fd689af69))
* **oauth:** add account management with models, settings, and download ([ba42c54](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/ba42c54a6bcd5c70e08e24f4a21fe6518b083382))
* **oauth:** add dedicated connect and model alias pages with diagram editor ([075963c](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/075963ccfca1f8d46aecd95c2a69fe0d95238fa7))
* **providers:** add pill button variant and migrate action buttons ([be3469a](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/be3469afc7b44d9fd4cd88d4b98cef1872a83ca1))
* **routing:** add type-safe routing strategy validation ([ae05650](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/ae056501d2cca8a47182f049daa5c7d3e8142057))
* **ui:** add dark mode support with theme toggle ([752b0e5](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/752b0e53339d844c977d7c386dac8ac052793009))
* **usage:** rebuild analytics pipeline with endpoint tracking and server-side aggregation ([56bbba1](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/56bbba18f2b6b9c746b2fa5f0a9a48d19a1c01be))


### Bug Fixes

* **theme:** stabilize mode switching and reduce flicker ([76433b4](https://github.com/quanpersie2001/cliproxyapi-dashboard/commit/76433b45dfdc9f01af3d36f373fa17dcd9b67819))

## Changelog
