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

/** Recoverable ambiguity in manually constructed cache-bearing usage. */
export type TokenUsageWarning = {
  code: "AMBIGUOUS_CACHED_INPUT";
  message: string;
};

/** Cost estimate with one warning when cache-bearing input lacks an explicit uncached count. */
export type CostEstimate = CostBreakdown & {
  warnings?: TokenUsageWarning[];
};

/** Shared validation options for estimation and tallying. */
export type CostEstimationOptions = {
  /** Reject cache-bearing usage without an explicit uncached count. Defaults to false. */
  requireExplicitUncachedInputTokens?: boolean;
};
