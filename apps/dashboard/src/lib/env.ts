import { z } from "zod";

const BUILD_TIME_DATABASE_URL = "postgresql://build:build@localhost:5432/build";
const BUILD_TIME_JWT_SECRET = "build-time-placeholder-at-least-32-chars";
const BUILD_TIME_MANAGEMENT_API_KEY = "build-time-placeholder-16ch";

function withBuildTimeFallbacks(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (process.env.NEXT_PHASE !== "phase-production-build") {
    return source;
  }

  return {
    ...source,
    DATABASE_URL: source.DATABASE_URL || BUILD_TIME_DATABASE_URL,
    JWT_SECRET: source.JWT_SECRET || BUILD_TIME_JWT_SECRET,
    MANAGEMENT_API_KEY: source.MANAGEMENT_API_KEY || BUILD_TIME_MANAGEMENT_API_KEY,
  };
}

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return value;
}, z.boolean());

function integerFromEnv(defaultValue: number, minValue = 0) {
  return z.preprocess((value) => {
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number.parseInt(value.trim(), 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    return undefined;
  }, z.number().int().min(minValue).default(defaultValue));
}

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .url("DATABASE_URL must be a valid URL")
    .startsWith("postgresql://", "DATABASE_URL must be a PostgreSQL connection string"),
  
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters long")
    .describe("Secret key for JWT signing"),
  
  MANAGEMENT_API_KEY: z
    .string()
    .min(16, "MANAGEMENT_API_KEY must be at least 16 characters long")
    .describe("API key for CLIProxyAPI management API authentication"),
  
  CLIPROXYAPI_MANAGEMENT_URL: z
    .string()
    .url("CLIPROXYAPI_MANAGEMENT_URL must be a valid URL")
    .default("http://cliproxyapi:8317/v0/management"),
  
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  
  TZ: z
    .string()
    .default("UTC"),
  
  JWT_EXPIRES_IN: z
    .string()
    .default("7d")
    .describe("JWT token expiration time"),
  
  CLIPROXYAPI_CONTAINER_NAME: z
    .string()
    .default("cliproxyapi"),
  
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info")
    .describe("Pino log level"),

  USAGE_COLLECTOR_ENABLED: booleanFromEnv
    .default(true)
    .describe("Enable resident usage collector worker"),

  USAGE_COLLECTOR_PULL_BATCH_SIZE: integerFromEnv(200, 1)
    .describe("Maximum queue messages pulled per collector cycle"),

  USAGE_COLLECTOR_PROCESS_BATCH_SIZE: integerFromEnv(200, 1)
    .describe("Maximum inbox rows processed per collector cycle"),

  USAGE_COLLECTOR_IDLE_MS: integerFromEnv(5000, 0)
    .describe("Idle delay between collector cycles in milliseconds"),

  USAGE_COLLECTOR_ERROR_BACKOFF_MS: integerFromEnv(15000, 0)
    .describe("Backoff delay after collector errors in milliseconds"),

  USAGE_COLLECTOR_LEADER_LOCK_KEY: integerFromEnv(942001, 1)
    .describe("PostgreSQL advisory lock key used for collector leadership"),

  PROVIDER_ENCRYPTION_KEY: z
    .string()
    .length(64, "PROVIDER_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)")
    .regex(/^[0-9a-fA-F]{64}$/, "PROVIDER_ENCRYPTION_KEY must be a valid hex string")
    .optional()
    .describe("AES-256-GCM key for encrypting custom provider API keys. Generate with: openssl rand -hex 32"),
});

function parseEnv() {
  const result = envSchema.safeParse(withBuildTimeFallbacks(process.env));
  
  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        const message = issue.message;
        return `  ${path}: ${message}`;
      })
      .join("\n");
    
    console.error("Environment validation failed:\n" + errors);
    throw new Error(
      `Invalid environment variables:\n${errors}\n\n` +
      "Please check your .env file or environment configuration."
    );
  }
  
  return result.data;
}

export const env = parseEnv();
