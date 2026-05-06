/**
 * Node.js-only instrumentation — imported conditionally from instrumentation.ts.
 * Starts background tasks that should not run in the Edge runtime.
 */

import { resyncCustomProviders } from "@/lib/providers/resync";
import { logger } from "@/lib/logger";

// Idempotency guard for HMR in dev — prevents duplicate registrations
const globalForNodeInstrumentation = globalThis as typeof globalThis & {
  __nodeInstrumentationRegistered?: boolean;
};

function scheduleTimeout(callback: () => void | Promise<void>, delayMs: number) {
  const timer = setTimeout(callback, delayMs);
  timer.unref?.();
  return timer;
}

export function registerNodeInstrumentation() {
  if (globalForNodeInstrumentation.__nodeInstrumentationRegistered) return;
  globalForNodeInstrumentation.__nodeInstrumentationRegistered = true;

  scheduleTimeout(() => {
    resyncCustomProviders().catch((err) => {
      logger.error({ err }, "Startup custom provider resync failed");
    });
  }, 15_000);
}
