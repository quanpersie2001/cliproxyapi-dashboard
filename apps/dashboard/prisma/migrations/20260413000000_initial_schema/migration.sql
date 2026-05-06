-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_api_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_key_ownerships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "keyIdentifier" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Unnamed Key',
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_key_ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_oauth_ownerships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_oauth_ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "excludedModels" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_providers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT,
    "prefix" TEXT,
    "proxyUrl" TEXT,
    "headers" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_groups" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_provider_models" (
    "id" TEXT NOT NULL,
    "customProviderId" TEXT NOT NULL,
    "upstreamName" TEXT NOT NULL,
    "alias" TEXT NOT NULL,

    CONSTRAINT "custom_provider_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_provider_excluded_models" (
    "id" TEXT NOT NULL,
    "customProviderId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,

    CONSTRAINT "custom_provider_excluded_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "authIndex" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "userId" TEXT,
    "endpoint" TEXT,
    "model" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collector_state" (
    "id" TEXT NOT NULL,
    "lastCollectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStatus" TEXT NOT NULL DEFAULT 'idle',
    "recordsStored" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collector_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_api_keys_key_key" ON "user_api_keys"("key");

-- CreateIndex
CREATE INDEX "user_api_keys_userId_idx" ON "user_api_keys"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_key_ownerships_keyHash_key" ON "provider_key_ownerships"("keyHash");

-- CreateIndex
CREATE INDEX "provider_key_ownerships_userId_idx" ON "provider_key_ownerships"("userId");

-- CreateIndex
CREATE INDEX "provider_key_ownerships_provider_idx" ON "provider_key_ownerships"("provider");

-- CreateIndex
CREATE INDEX "provider_key_ownerships_provider_keyHash_idx" ON "provider_key_ownerships"("provider", "keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "provider_oauth_ownerships_accountName_key" ON "provider_oauth_ownerships"("accountName");

-- CreateIndex
CREATE INDEX "provider_oauth_ownerships_userId_idx" ON "provider_oauth_ownerships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "model_preferences_userId_key" ON "model_preferences"("userId");

-- CreateIndex
CREATE INDEX "model_preferences_userId_idx" ON "model_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_providers_providerId_key" ON "custom_providers"("providerId");

-- CreateIndex
CREATE INDEX "custom_providers_userId_idx" ON "custom_providers"("userId");

-- CreateIndex
CREATE INDEX "custom_providers_groupId_idx" ON "custom_providers"("groupId");

-- CreateIndex
CREATE INDEX "custom_providers_providerId_idx" ON "custom_providers"("providerId");

-- CreateIndex
CREATE INDEX "provider_groups_userId_idx" ON "provider_groups"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_groups_userId_name_key" ON "provider_groups"("userId", "name");

-- CreateIndex
CREATE INDEX "custom_provider_models_customProviderId_idx" ON "custom_provider_models"("customProviderId");

-- CreateIndex
CREATE INDEX "custom_provider_excluded_models_customProviderId_idx" ON "custom_provider_excluded_models"("customProviderId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_target_idx" ON "audit_logs"("target");

-- CreateIndex
CREATE INDEX "usage_records_userId_idx" ON "usage_records"("userId");

-- CreateIndex
CREATE INDEX "usage_records_authIndex_idx" ON "usage_records"("authIndex");

-- CreateIndex
CREATE INDEX "usage_records_timestamp_idx" ON "usage_records"("timestamp");

-- CreateIndex
CREATE INDEX "usage_records_model_idx" ON "usage_records"("model");

-- CreateIndex
CREATE INDEX "usage_records_endpoint_idx" ON "usage_records"("endpoint");

-- CreateIndex
CREATE INDEX "usage_records_source_idx" ON "usage_records"("source");

-- CreateIndex
CREATE INDEX "usage_records_userId_timestamp_idx" ON "usage_records"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "usage_records_authIndex_timestamp_idx" ON "usage_records"("authIndex", "timestamp");

-- CreateIndex
CREATE INDEX "usage_records_collectedAt_idx" ON "usage_records"("collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_authIndex_model_timestamp_source_totalTokens_key" ON "usage_records"("authIndex", "model", "timestamp", "source", "totalTokens");

-- AddForeignKey
ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_key_ownerships" ADD CONSTRAINT "provider_key_ownerships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_oauth_ownerships" ADD CONSTRAINT "provider_oauth_ownerships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_preferences" ADD CONSTRAINT "model_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_providers" ADD CONSTRAINT "custom_providers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_providers" ADD CONSTRAINT "custom_providers_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "provider_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_groups" ADD CONSTRAINT "provider_groups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_provider_models" ADD CONSTRAINT "custom_provider_models_customProviderId_fkey" FOREIGN KEY ("customProviderId") REFERENCES "custom_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_provider_excluded_models" ADD CONSTRAINT "custom_provider_excluded_models_customProviderId_fkey" FOREIGN KEY ("customProviderId") REFERENCES "custom_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "user_api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

