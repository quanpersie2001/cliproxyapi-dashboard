# Spike Findings — br-wy1.sp2

**Feature:** usage-queue-ingestion  
**Question:** Does the built Docker image contain runnable collector JS and does container shutdown terminate both server and collector cleanly?  
**Decision:** YES

## Why this is YES
- The production runner already uses `tini` as PID 1 in `dashboard/Dockerfile:38-41` and `dashboard/Dockerfile:70-71`, so signal forwarding is available.
- The current runtime model is a shell entrypoint that applies migrations and then `exec node server.js` in `dashboard/entrypoint.sh:11-16`; this can be replaced with a small coordinator that launches `server.js` and compiled collector JS under the same PID 1 tree.
- The builder already has the full source tree and Prisma generation in `dashboard/Dockerfile:11-26`, and production already copies standalone output, generated Prisma client, Prisma schema, and `node_modules` in `dashboard/Dockerfile:51-58`.
- The project already has TypeScript and path alias support in `dashboard/package.json:5-18` and `dashboard/tsconfig.json:1-34`, so a dedicated `tsconfig.collector.json` plus copied build output is feasible without relying on `tsx` in production.

## Locked constraints propagated into later phases
- Runtime packaging must compile collector code to dedicated JS output during build; do not run collector from TypeScript source in production.
- The runner image must copy that compiled collector output alongside Next standalone artifacts.
- Entrypoint/coordinator must start both processes and trap shutdown so the collector exits when the container stops.
- This proof is for feasibility only; actual Docker smoke proof belongs to Phase 3 verification.
