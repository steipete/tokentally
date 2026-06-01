import { pricingFromUsdPerToken } from "../pricing.js";
import type { PricingMap } from "../types.js";
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
  };
};

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
  const json = (await response.json()) as { data?: OpenRouterModelInfo[] };
  const models = json?.data ?? [];
  catalogCache.set(apiKey, { fetchedAt: now, models });
  return models;
}

/**
 * Parses an OpenRouter price field into a finite, non-negative USD-per-token number.
 *
 * OpenRouter publishes prices as numeric strings (e.g. "0.000005"); numbers are
 * accepted too for robustness. Returns `null` for missing/malformed values.
 */
function parseUsdPerToken(value: string | number | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

/**
 * Converts OpenRouter's catalog pricing to a `PricingMap`.
 *
 * OpenRouter prices are already USD per token, so they map straight through.
 * Entries without valid pricing are skipped.
 */
export function openRouterPricingMapFromCatalog(catalog: OpenRouterModelInfo[]): PricingMap {
  const map: PricingMap = {};
  for (const entry of catalog) {
    const inputUsdPerToken = parseUsdPerToken(entry.pricing?.prompt);
    const outputUsdPerToken = parseUsdPerToken(entry.pricing?.completion);
    if (inputUsdPerToken !== null && outputUsdPerToken !== null) {
      map[entry.id] = pricingFromUsdPerToken({ inputUsdPerToken, outputUsdPerToken });
    }
  }
  return map;
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
