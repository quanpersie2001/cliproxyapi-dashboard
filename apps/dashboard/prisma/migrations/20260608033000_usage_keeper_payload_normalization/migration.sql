-- AlterTable
ALTER TABLE "usage_records"
ADD COLUMN "modelAlias" TEXT,
ADD COLUMN "ttftMs" INTEGER,
ADD COLUMN "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "reasoningEffort" TEXT,
ADD COLUMN "serviceTier" TEXT,
ADD COLUMN "executorType" TEXT;

-- Replace request_id-only eventKey uniqueness with the legacy composite dedupe contract.
DROP INDEX IF EXISTS "usage_records_eventKey_key";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "usage_records_eventKey_idx" ON "usage_records"("eventKey");
