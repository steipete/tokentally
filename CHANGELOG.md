# Changelog

## 0.1.5 (Unreleased)

- Tooling: update the formatter, linter, and pnpm
- Tooling: refresh Node types, Vitest coverage, Vite, package validation, formatter, linter, pnpm, and transitive dependencies

## 0.1.4 (2026-08-09)

**Highlight:** cached tokens are now priced. If your workload uses prompt
caching, previous versions under-reported its cost — sometimes dramatically.

- Core API: price cache-read and cache-creation tokens from catalog rates. Cache tokens were previously counted but never billed, so a request with 100 input, 50 output and 520 cache tokens priced only 150 of them. Rates come from the LiteLLM and OpenRouter catalogs; when a provider publishes no cache rate, the ordinary input rate applies rather than treating billed tokens as free (thanks @devYRPauli)
- Docs: rewrite the README around installation, first use, and catalog pricing
- Tooling: refresh the formatter, linter, package validation, types, CSS, and Vite toolchain

## 0.1.3 (2026-08-01)

- Core API: count Anthropic cache reads and writes toward inferred token totals (thanks @devYRPauli)
- Tooling: update development dependencies and pnpm

## 0.1.2 (2026-07-01)

- Core API: normalize nested provider usage details such as cached input tokens and reasoning tokens (thanks @kiranmagic7)
- Node helpers: fix OpenRouter string pricing parsing while preserving numeric catalog compatibility (thanks @devYRPauli)
- Packaging: bundle ESM and declarations with the Rolldown-powered tsdown toolchain

## 0.1.1 (2025-12-23)

- Tooling: bump pnpm to 10.26.1
- Docs: expand releasing checklist
- Packaging: publish prebuilt dist on npm

## 0.1.0 (2025-12-19)

- Core API: normalize token usage across common provider payload shapes (`normalizeTokenUsage`)
- Core API: pricing helpers (`pricingFromUsdPerMillion`, `pricingFromUsdPerToken`, `resolvePricingFromMap`)
- Core API: cost estimation + aggregation (`estimateUsdCost`, `tallyCosts`)
- Node helpers: LiteLLM catalog loader with on-disk cache + pricing/limit resolvers (`tokentally/node`)
- Node helpers: OpenRouter catalog fetch + pricing map helpers (`tokentally/node`)
- Tooling: Biome formatting/lint, oxlint (type-aware) enforced warning-free, Vitest tests + coverage
- CI: GitHub Actions on Node 20/22 via pnpm
