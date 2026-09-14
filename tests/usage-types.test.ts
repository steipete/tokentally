import type { TokenUsageNormalized } from "../src/index.js";

it("requires explicit uncached counts for cache-bearing usage types", () => {
  type Counts = { inputTokens: number; outputTokens: number };
  expectTypeOf<Counts>().toExtend<TokenUsageNormalized>();
  expectTypeOf<Counts & { cachedInputTokens: number }>().not.toExtend<TokenUsageNormalized>();
  expectTypeOf<
    Counts & { cacheCreationInputTokens: number }
  >().not.toExtend<TokenUsageNormalized>();
  expectTypeOf<
    Counts & { cachedInputTokens: number; uncachedInputTokens?: number }
  >().not.toExtend<TokenUsageNormalized>();
  expectTypeOf<
    Counts & { cachedInputTokens: number; uncachedInputTokens: number }
  >().toExtend<TokenUsageNormalized>();
  expectTypeOf<
    Counts & { cacheCreationInputTokens: number; uncachedInputTokens: number }
  >().toExtend<TokenUsageNormalized>();
});
