/**
 * Normalized token usage shape across providers.
 *
 * Notes:
 * - Missing fields are normalized to `0` by helpers like `normalizeTokenUsage()`.
 * - `totalTokens` may be omitted by providers; callers can treat it as advisory.
 */
export type TokenUsageNormalized = {
  inputTokens: number;
  outputTokens: number;
  /** Input tokens excluding cache reads and cache creation, when cache usage is known. */
  uncachedInputTokens?: number;
  cachedInputTokens?: number;
  cacheCreationInputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
};

/** Per-token USD pricing. */
export type Pricing = {
  inputUsdPerToken: number;
  outputUsdPerToken: number;
  cachedInputUsdPerToken?: number;
  cacheCreationInputUsdPerToken?: number;
};

/** Map of model id → pricing. */
export type PricingMap = Record<string, Pricing | undefined>;

/**
 * Resolve pricing for a model id.
 *
 * Can be async to fetch catalogs on-demand.
 */
export type PricingResolver = (modelId: string) => Pricing | null | Promise<Pricing | null>;

/** USD cost breakdown (all input categories/output/total). */
export type CostBreakdown = {
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
};
