import assert from "node:assert/strict";
import {
  estimateUsdCost,
  normalizeTokenUsage,
  resolvePricingFromMap,
  tallyCosts,
} from "tokentally";
import { openRouterPricingMapFromCatalog, resolveLiteLlmMaxOutputTokens } from "tokentally/node";

const usage = normalizeTokenUsage({ prompt_tokens: 1000, completion_tokens: 250 });
const pricing = resolvePricingFromMap(
  openRouterPricingMapFromCatalog([
    { id: "example/model", pricing: { prompt: "0.00000175", completion: "0.000014" } },
  ]),
  "example/model",
);
assert.ok(Math.abs(estimateUsdCost({ usage, pricing }).totalUsd - 0.00525) < 1e-12);
const tally = await tallyCosts({
  calls: [{ model: "example/model", usage }],
  resolvePricing: () => pricing,
});
assert.ok(Math.abs(tally.total.totalUsd - 0.00525) < 1e-12);
assert.equal(
  resolveLiteLlmMaxOutputTokens({ model: { max_tokens: "1024" } }, "openai/model"),
  1024,
);

const cachePricing = {
  inputUsdPerToken: 0.000001,
  outputUsdPerToken: 0.000002,
  cachedInputUsdPerToken: 0.0000001,
};
const direct = { inputTokens: 1000, outputTokens: 50, cachedInputTokens: 400 };
const openai = normalizeTokenUsage({
  prompt_tokens: 1000,
  completion_tokens: 50,
  prompt_tokens_details: { cached_tokens: 400 },
});
const anthropic = normalizeTokenUsage({
  input_tokens: 1000,
  output_tokens: 50,
  cache_read_input_tokens: 400,
});
for (const flag of [undefined, false, true]) {
  const options = { pricing: cachePricing, requireExplicitUncachedInputTokens: flag };
  assert.throws(() => estimateUsdCost({ usage: direct, ...options }), TypeError);
  for (const calls of [
    [direct, openai],
    [openai, direct],
  ]) {
    await assert.rejects(
      tallyCosts({
        calls: calls.map((usage) => ({ model: "example/model", usage })),
        resolvePricing: () => assert.fail("Ambiguous usage must fail before pricing resolution"),
        requireExplicitUncachedInputTokens: flag,
      }),
      TypeError,
    );
  }
  for (const [usage, expected] of [
    [openai, 0.00074],
    [anthropic, 0.00114],
    [{ ...direct, uncachedInputTokens: 600 }, 0.00074],
  ]) {
    assert.ok(Math.abs(estimateUsdCost({ usage, ...options }).totalUsd - expected) < 1e-12);
    const result = await tallyCosts({
      calls: [{ model: "example/model", usage }],
      resolvePricing: () => cachePricing,
      requireExplicitUncachedInputTokens: flag,
    });
    assert.ok(Math.abs(result.total.totalUsd - expected) < 1e-12);
  }
}
console.log(
  "PASS built package: core and Node exports, pricing, normalization, tally, catalog limits and strict cache accounting",
);
