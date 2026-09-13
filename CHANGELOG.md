# Changelog

## Unreleased

**Highlights:** Keep catalog pricing available, fix model-key accounting, and refresh development tooling.

- Node helpers: retain fetched LiteLLM pricing when disk caching is unavailable and avoid conditional requests without a usable cached catalog
- Core API: handle model IDs such as `__proto__` and `constructor` safely in tallies and catalog maps, and ignore inherited lookup entries
- Node helpers: validate OpenRouter responses before caching, skip malformed rows, and start cache TTL after fetch completion
- CI: validate built package exports on Node 24 and 26, build once per job, and enforce a two-day dependency release cooldown
- Tooling: align Node type definitions with the supported Node 24 runtime floor
- CI: keep pnpm on the maintained 11.x release line so Dependabot can update dependencies without a blocked native-binary bootstrap download
- Tooling: refresh Node types, Oxfmt, Oxlint, Vite, and their transitive dependencies

## 0.1.6 (2026-09-07)

**Highlights:** Detect ambiguous cached-token accounting while preserving existing default totals.

- Core API: add opt-in `requireExplicitUncachedInputTokens` validation to estimates and tallies, and return one structured warning per ambiguous result by default without console logging (thanks @devYRPauli)
- Docs: explain inclusive OpenAI and additive Anthropic cache counts, explicit-count migration, and the planned future strict default whose major/minor version and timing remain undecided

## 0.1.5 - 2026-09-05

- Tooling: refresh the test and coverage runner, build and package validation tools, Node types, formatter, linter, Vite, PostCSS, pnpm, and transitive dependencies

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
