/**
 * Normalized token usage shape across providers.
 *
 * Missing input/output counts normalize to `0`; optional detail counts remain absent.
 * `totalTokens` may be omitted by callers and should be treated as advisory.
 * Cache-bearing usage requires an explicit uncached count. Normalize the original
 * provider payload with `normalizeTokenUsage()` to derive it from provider semantics.
 */
export type TokenUsageNormalized = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  totalTokens?: number;
} & (
  | {
      /** Input tokens excluding cache reads and cache creation. */
      uncachedInputTokens: number;
      cachedInputTokens?: number;
      cacheCreationInputTokens?: number;
    }
  | {
      uncachedInputTokens?: number;
      cachedInputTokens?: never;
      cacheCreationInputTokens?: never;
    }
);

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

/** @deprecated Ambiguous cache-bearing usage now throws instead of returning a warning. */
export type TokenUsageWarning = {
  code: "AMBIGUOUS_CACHED_INPUT";
  message: string;
};

/** USD cost estimate. */
export type CostEstimate = CostBreakdown & {
  /** @deprecated Ambiguous usage now throws; warnings are no longer emitted. */
  warnings?: TokenUsageWarning[];
};

/** Shared validation options for estimation and tallying. */
export type CostEstimationOptions = {
  /** @deprecated No-op compatibility alias. Explicit uncached counts are always required for cache-bearing usage. */
  requireExplicitUncachedInputTokens?: boolean;
};
