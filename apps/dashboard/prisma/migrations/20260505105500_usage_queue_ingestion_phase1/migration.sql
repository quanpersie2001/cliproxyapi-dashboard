-- CreateEnum
CREATE TYPE "UsageQueueInboxStatus" AS ENUM ('pending', 'processed', 'decode_failed', 'process_failed', 'discarded');

-- AlterTable
ALTER TABLE "usage_records"
ADD COLUMN "eventKey" TEXT,
ADD COLUMN "requestId" TEXT,
ADD COLUMN "provider" TEXT,
ADD COLUMN "authType" TEXT;

-- CreateTable
CREATE TABLE "usage_queue_inbox" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT,
    "requestId" TEXT,
    "provider" TEXT,
    "authType" TEXT,
    "authIndex" TEXT,
    "apiGroupKey" TEXT,
    "model" TEXT,
    "source" TEXT,
    "timestamp" TIMESTAMP(3),
    "rawMessage" TEXT NOT NULL,
    "status" "UsageQueueInboxStatus" NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "discardedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "discardReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_queue_inbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_eventKey_key" ON "usage_records"("eventKey");

-- CreateIndex
CREATE INDEX "usage_queue_inbox_status_createdAt_idx" ON "usage_queue_inbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "usage_queue_inbox_eventKey_idx" ON "usage_queue_inbox"("eventKey");

-- CreateIndex
CREATE INDEX "usage_queue_inbox_requestId_idx" ON "usage_queue_inbox"("requestId");

-- CreateIndex
CREATE INDEX "usage_queue_inbox_authIndex_idx" ON "usage_queue_inbox"("authIndex");

-- CreateIndex
CREATE INDEX "usage_queue_inbox_status_updatedAt_idx" ON "usage_queue_inbox"("status", "updatedAt");
