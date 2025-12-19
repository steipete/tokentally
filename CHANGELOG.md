# Changelog

## 0.1.1 (Unreleased)

- Tooling: bump pnpm to 10.26.1
- Docs: expand releasing checklist

## 0.1.0 (2025-12-19)

- Core API: normalize token usage across common provider payload shapes (`normalizeTokenUsage`)
- Core API: pricing helpers (`pricingFromUsdPerMillion`, `pricingFromUsdPerToken`, `resolvePricingFromMap`)
- Core API: cost estimation + aggregation (`estimateUsdCost`, `tallyCosts`)
- Node helpers: LiteLLM catalog loader with on-disk cache + pricing/limit resolvers (`tokentally/node`)
- Node helpers: OpenRouter catalog fetch + pricing map helpers (`tokentally/node`)
- Tooling: Biome formatting/lint, oxlint (type-aware) enforced warning-free, Vitest tests + coverage
- CI: GitHub Actions on Node 20/22 via pnpm
