export interface UsageTokenCostInput {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  reasoningTokens: number;
}

export interface UsageTokenPrice {
  prompt: number;
  completion: number;
  cache: number;
  cacheCreation?: number;
  reasoning: number;
}

function clampTokenCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function calculateUsageTokenCost(input: UsageTokenCostInput, price: UsageTokenPrice): number {
  const inputTokens = clampTokenCount(input.inputTokens);
  const outputTokens = clampTokenCount(input.outputTokens);
  const cachedTokens = clampTokenCount(input.cachedTokens);
  const cacheReadTokens = clampTokenCount(input.cacheReadTokens ?? 0);
  const cacheCreationTokens = clampTokenCount(input.cacheCreationTokens ?? 0);
  const reasoningTokens = clampTokenCount(input.reasoningTokens);
  const usesExplicitCacheBuckets = cacheReadTokens > 0 || cacheCreationTokens > 0;
  const cacheCreationPrice = price.cacheCreation ?? price.prompt;

  if (usesExplicitCacheBuckets) {
    const promptTokens = Math.max(0, inputTokens - cacheReadTokens - cacheCreationTokens);
    return (
      (promptTokens / 1_000_000) * price.prompt +
      (cacheReadTokens / 1_000_000) * price.cache +
      (cacheCreationTokens / 1_000_000) * cacheCreationPrice +
      (outputTokens / 1_000_000) * price.completion +
      (reasoningTokens / 1_000_000) * price.reasoning
    );
  }

  const promptTokens = Math.max(0, inputTokens - cachedTokens);

  return (
    (promptTokens / 1_000_000) * price.prompt +
    (cachedTokens / 1_000_000) * price.cache +
    (outputTokens / 1_000_000) * price.completion +
    (reasoningTokens / 1_000_000) * price.reasoning
  );
}
