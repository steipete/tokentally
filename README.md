# tokentally 🧮 — Count the tokens. Mind the tab.

[![CI](https://img.shields.io/github/actions/workflow/status/steipete/tokentally/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/steipete/tokentally/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/tokentally?style=flat-square)](https://www.npmjs.com/package/tokentally)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/steipete/tokentally?style=flat-square)](LICENSE)

tokentally is a TypeScript library for normalizing LLM provider token usage and estimating
USD cost. Its core API works in browsers and Node.js; optional Node helpers load pricing and
model limits from LiteLLM or OpenRouter.

```js
import { estimateUsdCost, normalizeTokenUsage, pricingFromUsdPerMillion } from "tokentally";

const usage = normalizeTokenUsage({ prompt_tokens: 1_000, completion_tokens: 250 });
const pricing = pricingFromUsdPerMillion({ inputUsdPerMillion: 1.75, outputUsdPerMillion: 14 });
console.log(estimateUsdCost({ usage, pricing })?.totalUsd);
// 0.00525
```

## Install

```sh
pnpm add tokentally
```

tokentally requires Node.js 24 or newer when used in Node.js projects. The package is ESM-only.

## Quick start

Save the example above as `cost.mjs`, then run it:

```console
$ node cost.mjs
0.00525
```

`normalizeTokenUsage()` accepts common snake_case and camelCase provider fields. It returns
`null` when it cannot find a recognized token count, so unknown payloads do not silently become
zero-cost calls.

## Normalize usage

The normalizer understands OpenAI-style `prompt_tokens` and `completion_tokens`, Anthropic-style
`input_tokens` and `output_tokens`, camelCase variants, cached input details, and reasoning token
details. Missing recognized counts become zero, and a missing total is inferred from the fields
that are present.

```js
import { normalizeTokenUsage } from "tokentally";

const usage = normalizeTokenUsage({
  input_tokens: 120,
  output_tokens: 30,
  cache_read_input_tokens: 80,
});
// { inputTokens: 120, outputTokens: 30, uncachedInputTokens: 120,
//   cachedInputTokens: 80, totalTokens: 230 }
```

## Price and tally calls

Pricing is expressed as USD per token. Use `pricingFromUsdPerMillion()` for the rates commonly
published by providers, or `pricingFromUsdPerToken()` when the source already uses per-token
values. Both helpers accept optional cache-read and cache-creation rates. When a catalog does not
publish a cache rate, cache tokens fall back to the ordinary input rate rather than being treated
as free. `CostBreakdown.inputUsd` includes all three input categories.

| API                                     | Purpose                                              |
| --------------------------------------- | ---------------------------------------------------- |
| `normalizeTokenUsage(raw)`              | Normalize common provider usage shapes               |
| `pricingFromUsdPerMillion(rates)`       | Convert published per-million rates                  |
| `pricingFromUsdPerToken(rates)`         | Validate per-token rates                             |
| `resolvePricingFromMap(map, modelId)`   | Resolve exact and common provider-prefixed model IDs |
| `estimateUsdCost({ usage, pricing })`   | Price one normalized call                            |
| `tallyCosts({ calls, resolvePricing })` | Aggregate calls and cost by model                    |

`tallyCosts()` accepts a synchronous or asynchronous pricing resolver. Calls without usage still
count in the per-model breakdown; models without pricing retain their usage but have a `null`
cost and do not contribute to the total. Model maps use their own entries only; IDs such as
`constructor` and `__proto__` are treated as ordinary model IDs.

### Cache accounting

When constructing usage manually, supply `uncachedInputTokens` whenever either
`cachedInputTokens` or `cacheCreationInputTokens` is present, including a zero cache count.
The uncached count excludes both cache reads and cache creation. OpenAI's prompt count includes
cache reads; Anthropic's input count excludes cache reads and writes. A flattened object alone
cannot tell the estimator which interpretation you intended.

For example, with input at $1, output at $2, and cache reads at $0.10 per million tokens:

| Usage interpretation     | Input | Cached | Uncached | Total for 50 output tokens |
| ------------------------ | ----- | ------ | -------- | -------------------------- |
| OpenAI inclusive input   | 1,000 | 400    | 600      | $0.00074                   |
| Anthropic additive input | 1,000 | 400    | 1,000    | $0.00114                   |

`estimateUsdCost()` throws a `TypeError` for cache-bearing usage without an explicit
`uncachedInputTokens`; `tallyCosts()` rejects its promise. The exported `TokenUsageNormalized`
type requires this count too. Normalize the **original provider payload** to derive it correctly:

```js
import {
  estimateUsdCost,
  normalizeTokenUsage,
  pricingFromUsdPerMillion,
  tallyCosts,
} from "tokentally";

const pricing = pricingFromUsdPerMillion({
  inputUsdPerMillion: 1,
  outputUsdPerMillion: 2,
  cachedInputUsdPerMillion: 0.1,
});
const usage = normalizeTokenUsage({
  prompt_tokens: 1000,
  completion_tokens: 50,
  prompt_tokens_details: { cached_tokens: 400 },
});
const cost = estimateUsdCost({ usage, pricing });
// usage.uncachedInputTokens is 600; cost.totalUsd is 0.00074.
const result = await tallyCosts({
  calls: [{ model: "example/model", usage }],
  resolvePricing: () => pricing,
});
// result.total.totalUsd is 0.00074.
```

For manual OpenAI usage in the table above, pass `uncachedInputTokens: 600`; manual Anthropic
usage needs `uncachedInputTokens: 1000`. Passing an already flattened ambiguous object through
the normalizer cannot recover lost provider semantics. The estimator does not guess a provider
or automatically subtract cached tokens.

Validation checks every original call before pricing resolution and checks each call before
aggregation, so mixing normalized and ambiguous manual calls cannot hide the ambiguity. It also
applies when pricing is missing. Missing usage still returns `null`; valid usage with missing
pricing returns `null`, and an unpriced tally retains its usage with a `null` total.

## Compatibility

The upcoming **0.2.0** minor release makes the strict accounting introduced as an opt-in in 0.1.6
mandatory. This is a breaking change for manually constructed cache-bearing usage that omits
`uncachedInputTokens`, including zero-valued cache fields. The reported
`{ inputTokens: 1000, outputTokens: 50, cachedInputTokens: 400 }` now throws instead of returning
`$0.00114` with an `AMBIGUOUS_CACHED_INPUT` warning. Normalize the original provider payload or
supply the explicit count before estimating or tallying. Calls already using normalized provider
usage or explicit uncached counts retain their totals.

`requireExplicitUncachedInputTokens` remains accepted on both functions as a **deprecated no-op
alias**. Remove it from new code: omitted, `true`, and `false` all enforce the same validation;
`false` cannot restore the old arithmetic. Ambiguity warnings are no longer emitted. The exported
`TokenUsageWarning` type and optional `warnings` result fields remain as deprecated declarations
for source compatibility; migrate warning handling to error handling for invalid usage.

## Load catalog pricing in Node.js

Import catalog helpers from `tokentally/node`. The LiteLLM loader uses a seven-day disk cache at
`$HOME/.tokentally/cache`; set `TOKENTALLY_CACHE_DIR` to put it elsewhere. Disk caching is optional:
when no cache directory is configured or saving fails, a successful fetch still returns network
pricing. Failed refreshes fall back to a usable cached catalog. Empty responses and objects
without any model row containing a valid token rate or limit are rejected, so an upstream JSON
error cannot replace working pricing or postpone the next refresh. LiteLLM's `sample_spec`
metadata does not count as a model; partial model rows and extension data remain intact.

```js
import { loadLiteLlmCatalog, resolveLiteLlmPricing } from "tokentally/node";

const { catalog, source } = await loadLiteLlmCatalog({ env: process.env, fetchImpl: fetch });
const pricing = catalog ? resolveLiteLlmPricing(catalog, "openai/gpt-5.2") : null;
console.log({ source, pricing });
```

OpenRouter requires an API key supplied by your application. Its loader rejects malformed
response collections before caching, skips malformed model rows, and caches validated results
for five minutes from fetch completion:

```js
import { resolvePricingFromMap } from "tokentally";
import { fetchOpenRouterPricingMap } from "tokentally/node";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error("Set OPENROUTER_API_KEY");
const map = await fetchOpenRouterPricingMap({
  apiKey,
  fetchImpl: fetch,
});
const pricing = resolvePricingFromMap(map, "openai/gpt-5.2");
```

Catalog prices and limits can change. tokentally estimates cost from the source you provide; it
does not reconcile provider invoices.

## Development

```sh
pnpm install
pnpm check
```

`pnpm check` runs formatting, linting, type checks, tests with coverage, the package build, and a
smoke test of the built public exports. CI runs the full gate on Node.js 24 and 26.

## License

[MIT](LICENSE)
