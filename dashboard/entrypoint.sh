#!/bin/sh
set -e

echo "[dashboard] Ensuring database tables exist..."
node <<'NODE'
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  try {
    await client.connect();
  } catch (e) {
    if (e.code === '28P01') {
      console.error('[dashboard] FATAL: Password authentication failed for PostgreSQL user.');
      console.error('[dashboard] This usually means POSTGRES_PASSWORD in your .env was changed after the database was first created.');
      console.error('[dashboard] PostgreSQL only reads POSTGRES_PASSWORD during initial volume creation.');
      console.error('[dashboard]');
      console.error('[dashboard] To fix, choose one of:');
      console.error('[dashboard]   1. Reset the volume (destroys data): docker compose down -v && docker compose up -d');
      console.error('[dashboard]   2. Update the DB password to match your .env:');
      console.error('[dashboard]      docker compose exec postgres psql -U cliproxyapi -c "ALTER USER cliproxyapi PASSWORD \'<POSTGRES_PASSWORD from .env>\';"');
      console.error('[dashboard]   3. Revert POSTGRES_PASSWORD in .env to the original value');
    } else {
      console.error('[dashboard] FATAL: Cannot connect to database:', e.message);
    }
    process.exitCode = 1;
    return;
  }
  let failed = false;

  try {
    // Acquire advisory lock — prevents concurrent migration from multiple containers
    await client.query('SELECT pg_advisory_lock(424242)');
    console.log('[dashboard] Acquired migration lock');

    await client.query(`
    -- Users table with isAdmin field
    CREATE TABLE IF NOT EXISTS "users" (
      "id" TEXT NOT NULL,
      "username" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "sessionVersion" INTEGER NOT NULL DEFAULT 0,
      "isAdmin" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "users_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username");
    -- Add isAdmin column if missing (existing installs)
    DO $$ BEGIN
      ALTER TABLE "users" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;

    -- User API keys table (per-user API keys with dual storage sync)
    CREATE TABLE IF NOT EXISTS "user_api_keys" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "name" TEXT NOT NULL DEFAULT 'Default',
      "lastUsedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "user_api_keys_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "user_api_keys_key_key" ON "user_api_keys"("key");
    CREATE INDEX IF NOT EXISTS "user_api_keys_userId_idx" ON "user_api_keys"("userId");
    DO $$ BEGIN
      ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- Provider key ownerships table (track who added which API keys)
    CREATE TABLE IF NOT EXISTS "provider_key_ownerships" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "keyIdentifier" TEXT NOT NULL,
      "name" TEXT NOT NULL DEFAULT 'Unnamed Key',
      "keyHash" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "provider_key_ownerships_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "provider_key_ownerships_keyHash_key" ON "provider_key_ownerships"("keyHash");
    CREATE INDEX IF NOT EXISTS "provider_key_ownerships_userId_idx" ON "provider_key_ownerships"("userId");
    CREATE INDEX IF NOT EXISTS "provider_key_ownerships_provider_idx" ON "provider_key_ownerships"("provider");
    CREATE INDEX IF NOT EXISTS "provider_key_ownerships_provider_keyHash_idx" ON "provider_key_ownerships"("provider", "keyHash");
    DO $$ BEGIN
      ALTER TABLE "provider_key_ownerships" ADD CONSTRAINT "provider_key_ownerships_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    -- Add name column to provider_key_ownerships if missing (existing installs)
    DO $$ BEGIN
      ALTER TABLE "provider_key_ownerships" ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Unnamed Key';
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;

    -- Provider OAuth ownerships table (track who connected which OAuth accounts)
    CREATE TABLE IF NOT EXISTS "provider_oauth_ownerships" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "accountName" TEXT NOT NULL,
      "accountEmail" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "provider_oauth_ownerships_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "provider_oauth_ownerships_accountName_key" ON "provider_oauth_ownerships"("accountName");
    CREATE INDEX IF NOT EXISTS "provider_oauth_ownerships_userId_idx" ON "provider_oauth_ownerships"("userId");
    DO $$ BEGIN
      ALTER TABLE "provider_oauth_ownerships" ADD CONSTRAINT "provider_oauth_ownerships_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- System settings table (key-value store for global settings)
    CREATE TABLE IF NOT EXISTS "system_settings" (
      "id" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "system_settings_key_key" ON "system_settings"("key");

    -- Custom providers table (user-defined OpenAI-compatible providers)
    CREATE TABLE IF NOT EXISTS "custom_providers" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "providerId" TEXT NOT NULL,
      "baseUrl" TEXT NOT NULL,
      "apiKeyHash" TEXT NOT NULL,
      "prefix" TEXT,
      "proxyUrl" TEXT,
      "headers" JSONB DEFAULT '{}',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "custom_providers_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "custom_providers_providerId_key" ON "custom_providers"("providerId");
    CREATE INDEX IF NOT EXISTS "custom_providers_userId_idx" ON "custom_providers"("userId");
    CREATE INDEX IF NOT EXISTS "custom_providers_providerId_idx" ON "custom_providers"("providerId");
    DO $$ BEGIN
      ALTER TABLE "custom_providers" ADD CONSTRAINT "custom_providers_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    
    -- Add apiKeyEncrypted column if missing (existing installs upgrading to support auto-resync)
    DO $$ BEGIN
      ALTER TABLE "custom_providers" ADD COLUMN "apiKeyEncrypted" TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;

    -- Provider groups table (grouping + ordering for custom providers)
    CREATE TABLE IF NOT EXISTS "provider_groups" (
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
    CREATE UNIQUE INDEX IF NOT EXISTS "provider_groups_userId_name_key" ON "provider_groups"("userId", "name");
    CREATE INDEX IF NOT EXISTS "provider_groups_userId_idx" ON "provider_groups"("userId");
    DO $$ BEGIN
      ALTER TABLE "provider_groups" ADD CONSTRAINT "provider_groups_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "custom_providers" ADD COLUMN "groupId" TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "custom_providers" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "custom_providers" ADD CONSTRAINT "custom_providers_groupId_fkey"
        FOREIGN KEY ("groupId") REFERENCES "provider_groups"("id") ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "custom_providers_groupId_idx" ON "custom_providers"("groupId");

    -- Custom provider models table (model mappings for custom providers)
    CREATE TABLE IF NOT EXISTS "custom_provider_models" (
      "id" TEXT NOT NULL,
      "customProviderId" TEXT NOT NULL,
      "upstreamName" TEXT NOT NULL,
      "alias" TEXT NOT NULL,
      CONSTRAINT "custom_provider_models_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "custom_provider_models_customProviderId_idx" ON "custom_provider_models"("customProviderId");
    DO $$ BEGIN
      ALTER TABLE "custom_provider_models" ADD CONSTRAINT "custom_provider_models_customProviderId_fkey"
        FOREIGN KEY ("customProviderId") REFERENCES "custom_providers"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- Custom provider excluded models table (excluded model patterns for custom providers)
    CREATE TABLE IF NOT EXISTS "custom_provider_excluded_models" (
      "id" TEXT NOT NULL,
      "customProviderId" TEXT NOT NULL,
      "pattern" TEXT NOT NULL,
      CONSTRAINT "custom_provider_excluded_models_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "custom_provider_excluded_models_customProviderId_idx" ON "custom_provider_excluded_models"("customProviderId");
    DO $$ BEGIN
      ALTER TABLE "custom_provider_excluded_models" ADD CONSTRAINT "custom_provider_excluded_models_customProviderId_fkey"
        FOREIGN KEY ("customProviderId") REFERENCES "custom_providers"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- Audit logs table (track admin actions for compliance and security)
    CREATE TABLE IF NOT EXISTS "audit_logs" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "target" TEXT,
      "metadata" JSONB,
      "ipAddress" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "audit_logs_userId_idx" ON "audit_logs"("userId");
    CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
    CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs"("action");
    CREATE INDEX IF NOT EXISTS "audit_logs_target_idx" ON "audit_logs"("target");
    DO $$ BEGIN
      ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- Usage records table (persistent usage tracking)
    CREATE TABLE IF NOT EXISTS "usage_records" (
      "id" TEXT NOT NULL,
      "authIndex" TEXT NOT NULL,
      "apiKeyId" TEXT,
      "userId" TEXT,
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
    CREATE UNIQUE INDEX IF NOT EXISTS "usage_dedup_key" ON "usage_records"("authIndex", "model", "timestamp", "source", "totalTokens");
    CREATE INDEX IF NOT EXISTS "usage_records_userId_idx" ON "usage_records"("userId");
    CREATE INDEX IF NOT EXISTS "usage_records_authIndex_idx" ON "usage_records"("authIndex");
    CREATE INDEX IF NOT EXISTS "usage_records_timestamp_idx" ON "usage_records"("timestamp");
    CREATE INDEX IF NOT EXISTS "usage_records_model_idx" ON "usage_records"("model");
    CREATE INDEX IF NOT EXISTS "usage_records_source_idx" ON "usage_records"("source");
    CREATE INDEX IF NOT EXISTS "usage_records_userId_timestamp_idx" ON "usage_records"("userId", "timestamp");
    CREATE INDEX IF NOT EXISTS "usage_records_authIndex_timestamp_idx" ON "usage_records"("authIndex", "timestamp");
    CREATE INDEX IF NOT EXISTS "usage_records_collectedAt_idx" ON "usage_records"("collectedAt");
    DO $$ BEGIN
      ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_apiKeyId_fkey"
        FOREIGN KEY ("apiKeyId") REFERENCES "user_api_keys"("id") ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    -- Add latencyMs column if missing (existing installs upgrading to 0.1.53+)
    DO $$ BEGIN
      ALTER TABLE "usage_records" ADD COLUMN "latencyMs" INTEGER NOT NULL DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;

    -- Collector state table (tracks last collection timestamp)
    CREATE TABLE IF NOT EXISTS "collector_state" (
      "id" TEXT NOT NULL,
      "lastCollectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastStatus" TEXT NOT NULL DEFAULT 'idle',
      "recordsStored" INTEGER NOT NULL DEFAULT 0,
      "errorMessage" TEXT,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "collector_state_pkey" PRIMARY KEY ("id")
    );
    `);

    console.log('[dashboard] Tables ready');

  } catch (e) {
    console.error('[dashboard] FATAL: DB migration failed:', e.message);
    failed = true;
  } finally {
    // Release advisory lock — runs even on failure
    await client.query('SELECT pg_advisory_unlock(424242)').catch(() => {});
    await client.end();
  }

  if (failed) {
    process.exitCode = 1;  // Let Node exit naturally after cleanup
  }
}

migrate();
NODE

# Only reach here if migration succeeded (non-zero exit from node stops the script)
echo "[dashboard] Starting server..."
exec node server.js
