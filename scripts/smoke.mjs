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
console.log(
  "PASS built package: core and Node exports, pricing, normalization, tally and catalog limits",
);
