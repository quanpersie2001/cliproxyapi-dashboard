const DEFAULTS = {
  CLIPROXYAPI_MANAGEMENT_URL: "http://cliproxyapi:8317/v0/management",
  NODE_ENV: "development",
  USAGE_COLLECTOR_ENABLED: true,
  USAGE_COLLECTOR_PULL_BATCH_SIZE: 200,
  USAGE_COLLECTOR_PROCESS_BATCH_SIZE: 200,
  USAGE_COLLECTOR_IDLE_MS: 5000,
  USAGE_COLLECTOR_ERROR_BACKOFF_MS: 15000,
  USAGE_COLLECTOR_LEADER_LOCK_KEY: 942001,
} as const;

function text(name: string, fallback = ""): string {
  const value = process.env[name];
  if (!value) return fallback;
  return value.trim();
}

function integer(name: string, fallback: number): number {
  const value = Number.parseInt(text(name), 10);
  if (!Number.isFinite(value)) return fallback;
  return value;
}

function boolean(name: string, fallback: boolean): boolean {
  const value = text(name).toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export const env = {
  DATABASE_URL: text("DATABASE_URL"),
  JWT_SECRET: text("JWT_SECRET"),
  MANAGEMENT_API_KEY: text("MANAGEMENT_API_KEY"),
  CLIPROXYAPI_MANAGEMENT_URL: text("CLIPROXYAPI_MANAGEMENT_URL", DEFAULTS.CLIPROXYAPI_MANAGEMENT_URL),
  NODE_ENV: text("NODE_ENV", DEFAULTS.NODE_ENV) as "development" | "production" | "test",
  USAGE_COLLECTOR_ENABLED: boolean("USAGE_COLLECTOR_ENABLED", DEFAULTS.USAGE_COLLECTOR_ENABLED),
  USAGE_COLLECTOR_PULL_BATCH_SIZE: integer("USAGE_COLLECTOR_PULL_BATCH_SIZE", DEFAULTS.USAGE_COLLECTOR_PULL_BATCH_SIZE),
  USAGE_COLLECTOR_PROCESS_BATCH_SIZE: integer("USAGE_COLLECTOR_PROCESS_BATCH_SIZE", DEFAULTS.USAGE_COLLECTOR_PROCESS_BATCH_SIZE),
  USAGE_COLLECTOR_IDLE_MS: integer("USAGE_COLLECTOR_IDLE_MS", DEFAULTS.USAGE_COLLECTOR_IDLE_MS),
  USAGE_COLLECTOR_ERROR_BACKOFF_MS: integer("USAGE_COLLECTOR_ERROR_BACKOFF_MS", DEFAULTS.USAGE_COLLECTOR_ERROR_BACKOFF_MS),
  USAGE_COLLECTOR_LEADER_LOCK_KEY: integer("USAGE_COLLECTOR_LEADER_LOCK_KEY", DEFAULTS.USAGE_COLLECTOR_LEADER_LOCK_KEY),
};
