import { runCollectorRuntime } from "../../src/server/jobs/workers/usage-collector/runtime-main";

type CollectorSignal = {
  aborted: boolean;
};

const signal: CollectorSignal = { aborted: false };

const stop = () => {
  signal.aborted = true;
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

runCollectorRuntime({ signal }).catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`[usage-collector] dev runtime failed: ${message}`);
  process.exit(1);
});
