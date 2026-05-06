# Verification — br-gs1

- Feature: `usage-queue-ingestion`
- Bead: `br-gs1`
- Testing mode: `tdd-required`
- Timestamp (UTC): `2026-05-05T17:00:13Z`

## Implemented Changes

- Added migration: `apps/dashboard/prisma/migrations/20260505170500_collector_state_runtime_columns/migration.sql`
- Added migrated-DB integration test: `apps/dashboard/src/usage-collector/__tests__/collector-state-repository.postgres.test.ts`
  - test asserts required `collector_state` runtime columns are physically present
  - test exercises `PrismaCollectorStateRepository` writes (`ensureSingletonState`, `markRunning`, `markWakeHandled`, `markSuccess`)
  - test does not create or alter `collector_state` inside the harness

## TDD Evidence

### Red

Command:

```bash
cd dashboard && DATABASE_URL="<temp-schema-url>" npx prisma migrate deploy && npm test -- src/usage-collector/__tests__/collector-state-repository.postgres.test.ts
```

Exit code: `1`

Observed failure signal:

- `PrismaClientKnownRequestError`
- `The column wakeSequence does not exist in the current database.`
- Failure site: `PrismaCollectorStateRepository.ensureSingletonState()`

### Green

Command:

```bash
cd dashboard && DATABASE_URL="postgresql://cliproxyapi:devpassword@localhost:5433/<temp-db>" COLLECTOR_STATE_TEST_DATABASE_URL="postgresql://cliproxyapi:devpassword@localhost:5433/<temp-db>" npx prisma migrate deploy && npm test -- src/usage-collector/__tests__/collector-state-repository.postgres.test.ts
```

Exit code: `0`

Observed result:

- all 4 migrations applied on fresh temp DB including `20260505170500_collector_state_runtime_columns`
- `collector-state-repository.postgres.test.ts` passed (`1 passed`)

## Verify Commands (Bead Contract)

1. `cd dashboard && npm run prisma:generate`  
   Exit code: `0`  
   Result: Prisma Client generated successfully.

2. `cd dashboard && npm run typecheck`  
   Exit code: `0`  
   Result: TypeScript typecheck passed.

3. `cd dashboard && DATABASE_URL="postgresql://cliproxyapi:devpassword@localhost:5433/<temp-db>" COLLECTOR_STATE_TEST_DATABASE_URL="postgresql://cliproxyapi:devpassword@localhost:5433/<temp-db>" npx prisma migrate deploy && npm test -- src/usage-collector/__tests__/collector-state-repository.postgres.test.ts`  
   Exit code: `0`  
   Result: Migrated-database integration proof passed (`1 passed`).

4. `cd dashboard && npm test -- src/app/api/usage/collect/route.test.ts src/usage-collector/__tests__/worker-runner.test.ts`  
   Exit code: `0`  
   Result: Route and worker regression pack passed (`10 passed`).

## Generated Proof Artifacts

- Migration SQL: `apps/dashboard/prisma/migrations/20260505170500_collector_state_runtime_columns/migration.sql`
- Integration test: `apps/dashboard/src/usage-collector/__tests__/collector-state-repository.postgres.test.ts`
- This verification record: `history/usage-queue-ingestion/verification/br-gs1.md`
