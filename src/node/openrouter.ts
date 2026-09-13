import { pricingFromUsdPerToken } from "../pricing.js";
import { isRecord } from "../record.js";
import type { Pricing, PricingMap } from "../types.js";
import type { FetchFn } from "./types.js";

const OPENROUTER_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";

/** Minimal subset of OpenRouter model info used for pricing + limits. */
export type OpenRouterModelInfo = {
  id: string;
  context_length?: number;
  pricing?: {
    // OpenRouter returns these as USD-per-token numeric strings (e.g. "0.000005").
    prompt?: string | number;
    completion?: string | number;
    input_cache_read?: string | number;
    input_cache_write?: string | number;
  };
};

function parseModelInfo(value: unknown): OpenRouterModelInfo | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const model: OpenRouterModelInfo = { ...value, id: value.id };
  if (typeof value.context_length !== "number") delete model.context_length;
  if (isRecord(value.pricing)) {
    const pricing = { ...value.pricing };
    for (const key of ["prompt", "completion", "input_cache_read", "input_cache_write"]) {
      const rate = pricing[key];
      if (typeof rate !== "string" && typeof rate !== "number") delete pricing[key];
    }
    model.pricing = pricing;
  } else {
    delete model.pricing;
  }
  return model;
}

const catalogCache = new Map<string, { fetchedAt: number; models: OpenRouterModelInfo[] }>();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Fetches the OpenRouter model catalog (cached in-memory per `apiKey`).
 *
 * Note: OpenRouter pricing values are USD per token, returned as numeric strings.
 */
export async function fetchOpenRouterModelCatalog({
  apiKey,
  fetchImpl,
  ttlMs = DEFAULT_TTL_MS,
}: {
  apiKey: string;
  fetchImpl: FetchFn;
  ttlMs?: number;
}): Promise<OpenRouterModelInfo[]> {
  const cached = catalogCache.get(apiKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < ttlMs) return cached.models;

  const response = await fetchImpl(OPENROUTER_MODELS_ENDPOINT, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to load OpenRouter models (${response.status})`);
  }
  const json: unknown = await response.json();
  if (!isRecord(json) || !Array.isArray(json.data)) {
    throw new Error("Invalid OpenRouter models response: expected a data array");
  }
  const models = json.data.map(parseModelInfo).filter((model) => model !== null);
  catalogCache.set(apiKey, { fetchedAt: Date.now(), models });
  return models;
}

/** Numeric inputs retain the legacy USD-per-million contract; strings are per token. */
function openRouterPricePerToken(value: string | number | undefined): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value / 1_000_000 : undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

/**
 * Converts OpenRouter's catalog pricing to a `PricingMap`.
 *
 * String prices are USD per token; legacy numeric prices are USD per million.
 * Entries without valid pricing are skipped.
 */
export function openRouterPricingMapFromCatalog(catalog: OpenRouterModelInfo[]): PricingMap {
  const entries = new Map<string, Pricing>();
  for (const entry of catalog) {
    if (!isRecord(entry) || typeof entry.id !== "string") continue;
    const inputUsdPerToken = openRouterPricePerToken(entry.pricing?.prompt);
    const outputUsdPerToken = openRouterPricePerToken(entry.pricing?.completion);
    if (inputUsdPerToken === undefined || outputUsdPerToken === undefined) continue;
    entries.set(
      entry.id,
      pricingFromUsdPerToken({
        inputUsdPerToken,
        outputUsdPerToken,
        cachedInputUsdPerToken: openRouterPricePerToken(entry.pricing?.input_cache_read),
        cacheCreationInputUsdPerToken: openRouterPricePerToken(entry.pricing?.input_cache_write),
      }),
    );
  }
  return Object.fromEntries(entries);
}

/**
 * Convenience wrapper: fetch catalog → convert to pricing map.
 *
 * Uses the same in-memory TTL as `fetchOpenRouterModelCatalog()`.
 */
export async function fetchOpenRouterPricingMap({
  apiKey,
  fetchImpl,
  ttlMs,
}: {
  apiKey: string;
  fetchImpl: FetchFn;
  ttlMs?: number;
}): Promise<PricingMap> {
  const catalog = await fetchOpenRouterModelCatalog({ apiKey, fetchImpl, ttlMs });
  return openRouterPricingMapFromCatalog(catalog);
}
