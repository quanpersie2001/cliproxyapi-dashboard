export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LoggerLike {
  trace: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  fatal: (...args: unknown[]) => void;
}
