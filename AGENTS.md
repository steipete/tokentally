# Repository Guidelines

## Project Structure & Module Organization
- `src/`: core TypeScript modules (`usage`, `pricing`, `tally`, `index`).
- `src/node/`: Node-only helpers for catalog fetching/caching (LiteLLM, OpenRouter).
- `tests/`: Vitest suites, file pattern `*.test.ts` (e.g. `tests/usage.test.ts`).
- `dist/`: build output (generated; do not edit).
- `docs/`: project docs (release checklist).
- `coverage/`: test coverage output (generated).

## Build, Test, and Development Commands
- `pnpm install`: install dependencies (Node >=20 required).
- `pnpm build`: compile TypeScript to `dist/` for publishing.
- `pnpm test`: run the Vitest suite once.
- `pnpm test:coverage`: run tests with coverage output.
- `pnpm lint`: Biome linting for source/tests/config.
- `pnpm lint:fix`: Biome autofix where safe.
- `pnpm lint:oxlint:typeaware`: type-aware oxlint pass.
- `pnpm typecheck`: TypeScript typecheck without emit.
- `pnpm check`: full gate (lint + oxlint + typecheck + coverage).

## Coding Style & Naming Conventions
- ESM TypeScript; keep modules small and focused.
- Indentation: 2 spaces; line width: 100 (Biome).
- Use `pnpm format` or `pnpm lint:fix` before pushing.
- Naming: `camelCase` for functions/vars, `PascalCase` for types, `*.test.ts` for tests.
- Prefer descriptive model IDs and pricing names (`pricingFromUsdPerMillion`, `normalizeTokenUsage`).

## Testing Guidelines
- Framework: Vitest.
- Keep tests in `tests/` and mirror module names.
- Add regression tests for bug fixes when feasible.
- Use `pnpm test` for quick checks; `pnpm test:coverage` before release.

## Commit & Pull Request Guidelines
- Commit messages follow Conventional Commits (seen: `feat`, `fix`, `chore`, `docs`, `ci`).
- PRs should include a concise summary, tests run, and any API/behavior changes.
- Update `CHANGELOG.md` for user-facing changes and keep entries descending.

## Configuration & Runtime Notes
- Node >=20 (see `package.json` engines).
- OpenRouter helpers require `OPENROUTER_API_KEY`.
- LiteLLM cache defaults to `$HOME/.tokentally/cache`; override with `TOKENTALLY_CACHE_DIR`.
- Node helpers expect a `fetch` implementation to be passed in.
