-- CreateTable
CREATE TABLE "model_pricings" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "displayName" TEXT,
    "promptPriceUsd" DECIMAL(12,6) NOT NULL,
    "completionPriceUsd" DECIMAL(12,6) NOT NULL,
    "cachedPriceUsd" DECIMAL(12,6),
    "reasoningPriceUsd" DECIMAL(12,6),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "sourceUrl" TEXT,
    "manualOverride" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_pricings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "model_pricings_provider_model_key" ON "model_pricings"("provider", "model");

-- CreateIndex
CREATE INDEX "model_pricings_provider_idx" ON "model_pricings"("provider");

-- CreateIndex
CREATE INDEX "model_pricings_isActive_idx" ON "model_pricings"("isActive");

-- CreateIndex
CREATE INDEX "model_pricings_updatedAt_idx" ON "model_pricings"("updatedAt");
