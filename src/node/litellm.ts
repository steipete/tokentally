import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { modelIdCandidates } from "../model-id.js";
import { isRecord } from "../record.js";
import type { Pricing } from "../types.js";

const LITELLM_CATALOG_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type LiteLlmModelRow = {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
  max_output_tokens?: number | string;
  max_tokens?: number | string;
  max_input_tokens?: number | string;
};

/** LiteLLM catalog shape: model name → pricing/limits row. */
export type LiteLlmCatalog = Record<string, LiteLlmModelRow | undefined>;

type CacheMeta = {
  fetchedAtMs: number;
  catalogSha256?: string;
  etag?: string;
  lastModified?: string;
};

type CachePaths = { catalogPath: string; metaPath: string };

function cachePaths(env: Record<string, string | undefined>): CachePaths | null {
  const override = env.TOKENTALLY_CACHE_DIR?.trim();
  const home = env.HOME?.trim();
  const cacheDir = override || (home ? path.join(home, ".tokentally", "cache") : null);
  if (!cacheDir) return null;
  return {
    catalogPath: path.join(cacheDir, "litellm-model_prices_and_context_window.json"),
    metaPath: path.join(cacheDir, "litellm-model_prices_and_context_window.meta.json"),
  };
}

async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

function catalogSha256(catalog: LiteLlmCatalog): string {
  return createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
}

async function updateCache(
  paths: CachePaths | null,
  meta: CacheMeta,
  catalog?: LiteLlmCatalog,
): Promise<void> {
  if (!paths) return;
  try {
    // Do not advance validators/freshness unless the corresponding catalog was saved.
    if (catalog) await writeJsonFile(paths.catalogPath, catalog);
    await writeJsonFile(
      paths.metaPath,
      catalog ? { ...meta, catalogSha256: catalogSha256(catalog) } : meta,
    );
  } catch {
    // Disk caching is optional; a valid network response remains usable if persistence fails.
  }
}

function parseCacheMeta(raw: unknown): CacheMeta | null {
  if (!isRecord(raw) || typeof raw.fetchedAtMs !== "number" || !Number.isFinite(raw.fetchedAtMs)) {
    return null;
  }
  if (
    raw.catalogSha256 !== undefined &&
    (typeof raw.catalogSha256 !== "string" || !/^[a-f0-9]{64}$/.test(raw.catalogSha256))
  )
    return null;
  return {
    fetchedAtMs: raw.fetchedAtMs,
    ...(typeof raw.catalogSha256 === "string" ? { catalogSha256: raw.catalogSha256 } : {}),
    ...(typeof raw.etag === "string" ? { etag: raw.etag } : {}),
    ...(typeof raw.lastModified === "string" ? { lastModified: raw.lastModified } : {}),
  };
}

function isStale(meta: CacheMeta | null, nowMs: number): boolean {
  if (!meta) return true;
  return nowMs - meta.fetchedAtMs > CACHE_TTL_MS;
}

function parseCatalog(raw: unknown): LiteLlmCatalog | null {
  if (!isRecord(raw)) return null;
  return raw as LiteLlmCatalog;
}

/** Result of `loadLiteLlmCatalog()` including the cache/network source. */
export type LiteLlmLoadResult = {
  catalog: LiteLlmCatalog | null;
  source: "cache" | "network" | "none";
};

/**
 * Loads the LiteLLM pricing catalog with a small on-disk cache.
 *
 * Cache location:
 * - `$TOKENTALLY_CACHE_DIR` if set
 * - otherwise: `$HOME/.tokentally/cache`
 */
export async function loadLiteLlmCatalog({
  env,
  fetchImpl,
  nowMs = Date.now(),
}: {
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
  nowMs?: number;
}): Promise<LiteLlmLoadResult> {
  const paths = cachePaths(env);
  const [rawMeta, cached] = paths
    ? await Promise.all([readJsonFile(paths.metaPath), readJsonFile(paths.catalogPath)])
    : [null, null];
  const meta = parseCacheMeta(rawMeta);
  const cachedCatalog = parseCatalog(cached);
  const validatorsMatch =
    cachedCatalog !== null && meta?.catalogSha256 === catalogSha256(cachedCatalog);
  // Legacy metadata retains its TTL, but only digest-bound validators may request a 304.
  const freshnessMeta = meta?.catalogSha256 === undefined || validatorsMatch ? meta : null;
  const fallback: LiteLlmLoadResult = {
    catalog: cachedCatalog,
    source: cachedCatalog ? "cache" : "none",
  };

  if (cachedCatalog && !isStale(freshnessMeta, nowMs)) {
    return { catalog: cachedCatalog, source: "cache" };
  }

  const headers: Record<string, string> = {};
  if (validatorsMatch) {
    if (meta?.etag) headers["if-none-match"] = meta.etag;
    if (meta?.lastModified) headers["if-modified-since"] = meta.lastModified;
  }

  try {
    const response = await fetchImpl(LITELLM_CATALOG_URL, { headers });
    if (response.status === 304 && validatorsMatch && cachedCatalog) {
      await updateCache(paths, {
        ...meta,
        fetchedAtMs: nowMs,
        catalogSha256: catalogSha256(cachedCatalog),
      });
      return { catalog: cachedCatalog, source: "cache" };
    }
    if (!response.ok) {
      return fallback;
    }

    const json = (await response.json()) as unknown;
    const parsed = parseCatalog(json);
    if (!parsed) {
      return fallback;
    }

    await updateCache(
      paths,
      {
        fetchedAtMs: nowMs,
        etag: response.headers.get("etag") ?? undefined,
        lastModified: response.headers.get("last-modified") ?? undefined,
      },
      parsed,
    );

    return { catalog: parsed, source: "network" };
  } catch {
    return fallback;
  }
}

/**
 * Resolves per-token USD pricing from a LiteLLM catalog.
 *
 * Skips entries where both prices are `0` (LiteLLM uses `0` for unknown/free in some rows).
 */
export function resolveLiteLlmPricing(catalog: LiteLlmCatalog, modelId: string): Pricing | null {
  const candidates = modelIdCandidates(modelId, ["openai", "google", "anthropic", "xai"]);
  for (const key of candidates) {
    const row = Object.hasOwn(catalog, key) ? catalog[key] : undefined;
    const input = row?.input_cost_per_token;
    const output = row?.output_cost_per_token;
    if (
      typeof input === "number" &&
      Number.isFinite(input) &&
      input >= 0 &&
      typeof output === "number" &&
      Number.isFinite(output) &&
      output >= 0
    ) {
      if (input === 0 && output === 0) continue;
      const cachedInput = row?.cache_read_input_token_cost;
      const cacheCreationInput = row?.cache_creation_input_token_cost;
      return {
        inputUsdPerToken: input,
        outputUsdPerToken: output,
        ...(typeof cachedInput === "number" && Number.isFinite(cachedInput) && cachedInput >= 0
          ? { cachedInputUsdPerToken: cachedInput }
          : {}),
        ...(typeof cacheCreationInput === "number" &&
        Number.isFinite(cacheCreationInput) &&
        cacheCreationInput >= 0
          ? { cacheCreationInputUsdPerToken: cacheCreationInput }
          : {}),
      };
    }
  }
  return null;
}

function toFinitePositiveInt(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) return null;
  const int = Math.floor(parsed);
  return int > 0 ? int : null;
}

/**
 * Resolves max output tokens from a LiteLLM catalog (best-effort).
 *
 * Falls back to legacy `max_tokens` when `max_output_tokens` is missing.
 */
export function resolveLiteLlmMaxOutputTokens(
  catalog: LiteLlmCatalog,
  modelId: string,
): number | null {
  const candidates = modelIdCandidates(modelId, ["openai", "google", "anthropic", "xai"]);
  for (const key of candidates) {
    const row = Object.hasOwn(catalog, key) ? catalog[key] : undefined;
    const maxOutput = toFinitePositiveInt(row?.max_output_tokens);
    if (maxOutput) return maxOutput;

    const maxTokens = toFinitePositiveInt(row?.max_tokens);
    if (maxTokens) return maxTokens;
  }
  return null;
}

/** Resolves max input tokens from a LiteLLM catalog (best-effort). */
export function resolveLiteLlmMaxInputTokens(
  catalog: LiteLlmCatalog,
  modelId: string,
): number | null {
  const candidates = modelIdCandidates(modelId, ["openai", "google", "anthropic", "xai"]);
  for (const key of candidates) {
    const row = Object.hasOwn(catalog, key) ? catalog[key] : undefined;
    const maxInput = toFinitePositiveInt(row?.max_input_tokens);
    if (maxInput) return maxInput;
  }
  return null;
}
