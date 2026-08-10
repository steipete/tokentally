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
// { inputTokens: 120, outputTokens: 30, cachedInputTokens: 80, totalTokens: 230 }
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
cost and do not contribute to the total.

## Load catalog pricing in Node.js

Import catalog helpers from `tokentally/node`. The LiteLLM loader uses a seven-day disk cache at
`$HOME/.tokentally/cache`; set `TOKENTALLY_CACHE_DIR` to put it elsewhere.

```js
import { loadLiteLlmCatalog, resolveLiteLlmPricing } from "tokentally/node";

const { catalog, source } = await loadLiteLlmCatalog({ env: process.env, fetchImpl: fetch });
const pricing = catalog ? resolveLiteLlmPricing(catalog, "openai/gpt-5.2") : null;
console.log({ source, pricing });
```

OpenRouter requires an API key supplied by your application:

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

`pnpm check` runs formatting, linting, type checks, tests with coverage, and the package build.

## License

[MIT](LICENSE)
