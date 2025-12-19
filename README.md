# tokentally

Token usage in, dollar totals out.

Small TypeScript library for:
- Normalizing token usage across providers
- Resolving per-token pricing (static maps, LiteLLM catalog, OpenRouter catalog)
- Estimating and aggregating USD cost

## Install

```bash
pnpm add tokentally
```

## Core usage (browser-safe)

```ts
import { estimateUsdCost, normalizeTokenUsage, pricingFromUsdPerMillion } from 'tokentally';

const usage = normalizeTokenUsage({ prompt_tokens: 1000, completion_tokens: 250 });
const pricing = pricingFromUsdPerMillion({ inputUsdPerMillion: 1.75, outputUsdPerMillion: 14 });

const cost = estimateUsdCost({ usage, pricing });
// { inputUsd: ..., outputUsd: ..., totalUsd: ... }
```

## Node helpers (catalog sources)

### LiteLLM pricing + limits

```ts
import { loadLiteLlmCatalog, resolveLiteLlmPricing, resolveLiteLlmMaxOutputTokens } from 'tokentally/node';

const { catalog } = await loadLiteLlmCatalog({ env: process.env, fetchImpl: fetch });
const pricing = catalog ? resolveLiteLlmPricing(catalog, 'openai/gpt-5.2') : null;
const maxOut = catalog ? resolveLiteLlmMaxOutputTokens(catalog, 'openai/gpt-5.2') : null;
```

### OpenRouter pricing (optional)

```ts
import { fetchOpenRouterPricingMap, resolvePricingFromMap } from 'tokentally/node';

const map = await fetchOpenRouterPricingMap({ apiKey: process.env.OPENROUTER_API_KEY!, fetchImpl: fetch });
const pricing = resolvePricingFromMap(map, 'openai/gpt-5.2');
```

## API

- `normalizeTokenUsage(raw)` → `{ inputTokens, outputTokens, reasoningTokens, totalTokens } | null`
- `pricingFromUsdPerMillion({ inputUsdPerMillion, outputUsdPerMillion })`
- `estimateUsdCost({ usage, pricing })`
- `tallyCosts(calls)` → totals + per-model breakdown

## Non-goals

- Perfect accounting. This is a **best-effort estimate** based on the pricing source you provide.
- Provider-specific invoice reconciliation.

## License

MIT

