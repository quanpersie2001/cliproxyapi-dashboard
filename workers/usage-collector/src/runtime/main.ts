import { runCollectorRuntime } from "./runtime-main";

void runCollectorRuntime().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
