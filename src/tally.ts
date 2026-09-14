import type {
  CostBreakdown,
  CostEstimate,
  CostEstimationOptions,
  Pricing,
  PricingResolver,
  TokenUsageNormalized,
  TokenUsageWarning,
} from "./types.js";

function checkCacheUsage(usage: TokenUsageNormalized): void {
  if (
    usage.uncachedInputTokens != null ||
    (usage.cachedInputTokens == null && usage.cacheCreationInputTokens == null)
  ) {
    return;
  }
  const message =
    "Cache-bearing usage is ambiguous without uncachedInputTokens. " +
    "Normalize the original provider payload with normalizeTokenUsage() or pass an explicit " +
    "uncachedInputTokens count excluding cache reads and cache creation.";
  throw new TypeError(message);
}

/**
 * Estimates USD cost for a single call from normalized usage + pricing.
 *
 * Throws `TypeError` for cache-bearing usage without an explicit uncached count,
 * even when pricing is missing. Otherwise returns `null` for missing usage or pricing.
 */
export function estimateUsdCost({
  usage,
  pricing,
}: {
  usage: TokenUsageNormalized | null;
  pricing: Pricing | null;
} & CostEstimationOptions): CostEstimate | null {
  if (!usage) return null;
  checkCacheUsage(usage);
  if (!pricing) return null;
  return calculateUsdCost(usage, pricing);
}

function calculateUsdCost(usage: TokenUsageNormalized, pricing: Pricing): CostBreakdown {
  const uncachedInputTokens = usage.uncachedInputTokens ?? usage.inputTokens;
  const cachedInputTokens = usage.cachedInputTokens ?? 0;
  const cacheCreationInputTokens = usage.cacheCreationInputTokens ?? 0;
  // Some catalog providers do not publish cache rates for every model. Falling back to the
  // ordinary input rate avoids silently treating billed cache tokens as free.
  const cachedInputUsdPerToken = pricing.cachedInputUsdPerToken ?? pricing.inputUsdPerToken;
  const cacheCreationInputUsdPerToken =
    pricing.cacheCreationInputUsdPerToken ?? pricing.inputUsdPerToken;
  const inputUsd =
    uncachedInputTokens * pricing.inputUsdPerToken +
    cachedInputTokens * cachedInputUsdPerToken +
    cacheCreationInputTokens * cacheCreationInputUsdPerToken;
  const outputUsd = usage.outputTokens * pricing.outputUsdPerToken;
  return { inputUsd, outputUsd, totalUsd: inputUsd + outputUsd };
}

/** One model call to be tallied. */
export type TallyCall = {
  model: string;
  usage: TokenUsageNormalized | null;
};

/**
 * Aggregated tally output.
 *
 * - `total`: sum of all calls where pricing was resolvable
 * - `byModel`: counts + accumulated usage + (optional) cost per model
 */
export type TallyResult = {
  total: CostBreakdown | null;
  /** @deprecated Ambiguous usage now rejects the tally; warnings are no longer emitted. */
  warnings?: TokenUsageWarning[];
  byModel: Record<
    string,
    { calls: number; usage: TokenUsageNormalized; cost: CostBreakdown | null }
  >;
};

function addUsage(a: TokenUsageNormalized, b: TokenUsageNormalized): TokenUsageNormalized {
  const uncachedInputTokens =
    a.uncachedInputTokens != null || b.uncachedInputTokens != null
      ? (a.uncachedInputTokens ?? a.inputTokens) + (b.uncachedInputTokens ?? b.inputTokens)
      : undefined;
  const cachedInputTokens =
    a.cachedInputTokens != null || b.cachedInputTokens != null
      ? (a.cachedInputTokens ?? 0) + (b.cachedInputTokens ?? 0)
      : undefined;
  const cacheCreationInputTokens =
    a.cacheCreationInputTokens != null || b.cacheCreationInputTokens != null
      ? (a.cacheCreationInputTokens ?? 0) + (b.cacheCreationInputTokens ?? 0)
      : undefined;

  const counts = {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    reasoningTokens: (a.reasoningTokens ?? 0) + (b.reasoningTokens ?? 0),
    totalTokens: (a.totalTokens ?? 0) + (b.totalTokens ?? 0),
  };
  if (uncachedInputTokens == null) return counts;
  return {
    ...counts,
    uncachedInputTokens,
    ...(cachedInputTokens != null ? { cachedInputTokens } : {}),
    ...(cacheCreationInputTokens != null ? { cacheCreationInputTokens } : {}),
  };
}

function emptyUsage(): TokenUsageNormalized {
  return { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 };
}

/**
 * Tallies costs across a list of calls, grouped by `model`.
 *
 * `resolvePricing(modelId)` can be async (e.g. catalog fetch).
 * Rejects cache-bearing calls without explicit uncached counts before pricing resolution.
 */
export async function tallyCosts({
  calls,
  resolvePricing,
}: {
  calls: TallyCall[];
  resolvePricing: PricingResolver;
} & CostEstimationOptions): Promise<TallyResult> {
  const rows = new Map<string, TallyResult["byModel"][string]>();

  for (const call of calls) {
    const model = call.model;
    const usage = call.usage;
    // Aggregation can fill the uncached count from another call and hide ambiguous input.
    if (usage) checkCacheUsage(usage);
    let row = rows.get(model);
    if (!row) {
      row = { calls: 0, usage: emptyUsage(), cost: null };
      rows.set(model, row);
    }
    row.calls += 1;
    if (usage) row.usage = addUsage(row.usage, usage);
  }

  const byModel = Object.fromEntries(rows);
  let total: CostBreakdown | null = null;
  for (const [model, row] of Object.entries(byModel)) {
    const pricing = await resolvePricing(model);
    row.cost = pricing ? calculateUsdCost(row.usage, pricing) : null;
    if (row.cost) {
      if (!total) total = { inputUsd: 0, outputUsd: 0, totalUsd: 0 };
      total.inputUsd += row.cost.inputUsd;
      total.outputUsd += row.cost.outputUsd;
      total.totalUsd += row.cost.totalUsd;
    }
  }

  return { total, byModel };
}
