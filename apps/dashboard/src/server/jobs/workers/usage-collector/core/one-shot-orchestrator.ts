import type {
  CollectorOrchestrator,
  DrainNowOptions,
  DrainNowResult,
  ProcessOnceOptions,
  ProcessOnceResult,
  PullOnceOptions,
  PullOnceResult,
} from "./orchestrator";
import { CollectorProcessService } from "./process-service";
import { CollectorPullService } from "./pull-service";

export interface OneShotCollectorOrchestratorOptions {
  pullService: CollectorPullService;
  processService: CollectorProcessService;
}

export class OneShotCollectorOrchestrator implements CollectorOrchestrator {
  public constructor(private readonly options: OneShotCollectorOrchestratorOptions) {}

  public async pullOnce(options: PullOnceOptions): Promise<PullOnceResult> {
    return this.options.pullService.pullOnce(options);
  }

  public async processOnce(options: ProcessOnceOptions): Promise<ProcessOnceResult> {
    return this.options.processService.processOnce(options);
  }

  public async drainNow(options: DrainNowOptions): Promise<DrainNowResult> {
    const pulled = await this.pullOnce(options.pull);
    const processed = await this.processOnce(options.process);

    return {
      summary: {
        pulled: pulled.metrics,
        processed: processed.metrics,
      },
    };
  }
}
