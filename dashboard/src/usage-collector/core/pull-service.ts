import type { UsageMessageSource, UsageQueueInboxRepository } from "@/usage-collector/contracts";
import type { PullOnceOptions, PullOnceResult } from "@/usage-collector/core/orchestrator";

export interface CollectorPullServiceOptions {
  source: UsageMessageSource;
  inboxRepository: UsageQueueInboxRepository;
  now?: () => Date;
}

export class CollectorPullService {
  private readonly now: () => Date;

  public constructor(private readonly options: CollectorPullServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  public async pullOnce(pullOptions: PullOnceOptions): Promise<PullOnceResult> {
    const startedAt = this.now().getTime();
    const envelopes = await this.options.source.pullBatch(pullOptions);
    const pulled = envelopes.length;
    let stored = 0;
    try {
      stored = await this.options.inboxRepository.storeRawMessages(envelopes);
    } catch (error) {
      const reason = toErrorMessage(error);
      throw new Error(
        `pull_store_failed: pulled=${pulled} persisted=0 loss_window_open=true reason=${reason}`,
        { cause: error }
      );
    }
    const dropped = Math.max(0, pulled - stored);
    const durationMs = Math.max(0, this.now().getTime() - startedAt);

    return {
      metrics: {
        pulled,
        stored,
        dropped,
        durationMs,
      },
    };
  }
}

function toErrorMessage(value: unknown): string {
  if (value instanceof Error && value.message) {
    return value.message;
  }
  return "store_failed";
}
