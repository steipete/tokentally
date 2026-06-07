import { pricingFromUsdPerMillion, pricingFromUsdPerToken } from "../pricing.js";
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
 * Parses an OpenRouter price field into a finite, non-negative number.
 *
 * OpenRouter publishes prices as numeric strings in USD per token (e.g. "0.000005").
 * Numeric catalog inputs predate that live shape and are preserved as USD per 1M.
 * Returns `null` for missing/malformed values.
 */
function parseOpenRouterPrice(value: string | number | undefined): {
  value: number;
  unit: "per-token" | "per-million";
} | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? { value, unit: "per-million" } : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? { value: parsed, unit: "per-token" } : null;
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
    const inputPrice = parseOpenRouterPrice(entry.pricing?.prompt);
    const outputPrice = parseOpenRouterPrice(entry.pricing?.completion);
    if (inputPrice !== null && outputPrice !== null) {
      map[entry.id] =
        inputPrice.unit === "per-token" && outputPrice.unit === "per-token"
          ? pricingFromUsdPerToken({
              inputUsdPerToken: inputPrice.value,
              outputUsdPerToken: outputPrice.value,
            })
          : pricingFromUsdPerMillion({
              inputUsdPerMillion:
                inputPrice.unit === "per-million" ? inputPrice.value : inputPrice.value * 1_000_000,
              outputUsdPerMillion:
                outputPrice.unit === "per-million"
                  ? outputPrice.value
                  : outputPrice.value * 1_000_000,
            });
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
