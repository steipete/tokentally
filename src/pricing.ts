import { modelIdCandidates } from "./model-id.js";
import type { Pricing, PricingMap } from "./types.js";

function validateRate(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite, non-negative number`);
  }
}

/**
 * Convenience helper for pricing tables that publish USD per 1M tokens.
 *
 * Example: input $1.75 / 1M, output $14.00 / 1M.
 */
export function pricingFromUsdPerMillion({
  inputUsdPerMillion,
  outputUsdPerMillion,
  cachedInputUsdPerMillion,
  cacheCreationInputUsdPerMillion,
}: {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion?: number;
  cacheCreationInputUsdPerMillion?: number;
}): Pricing {
  validateRate(inputUsdPerMillion, "inputUsdPerMillion");
  validateRate(outputUsdPerMillion, "outputUsdPerMillion");
  if (cachedInputUsdPerMillion !== undefined) {
    validateRate(cachedInputUsdPerMillion, "cachedInputUsdPerMillion");
  }
  if (cacheCreationInputUsdPerMillion !== undefined) {
    validateRate(cacheCreationInputUsdPerMillion, "cacheCreationInputUsdPerMillion");
  }
  return {
    inputUsdPerToken: inputUsdPerMillion / 1_000_000,
    outputUsdPerToken: outputUsdPerMillion / 1_000_000,
    ...(cachedInputUsdPerMillion !== undefined
      ? { cachedInputUsdPerToken: cachedInputUsdPerMillion / 1_000_000 }
      : {}),
    ...(cacheCreationInputUsdPerMillion !== undefined
      ? { cacheCreationInputUsdPerToken: cacheCreationInputUsdPerMillion / 1_000_000 }
      : {}),
  };
}

/**
 * Creates a `Pricing` instance from USD-per-token values.
 *
 * Use this when you already have per-token pricing (rather than per-million).
 */
export function pricingFromUsdPerToken({
  inputUsdPerToken,
  outputUsdPerToken,
  cachedInputUsdPerToken,
  cacheCreationInputUsdPerToken,
}: {
  inputUsdPerToken: number;
  outputUsdPerToken: number;
  cachedInputUsdPerToken?: number;
  cacheCreationInputUsdPerToken?: number;
}): Pricing {
  validateRate(inputUsdPerToken, "inputUsdPerToken");
  validateRate(outputUsdPerToken, "outputUsdPerToken");
  if (cachedInputUsdPerToken !== undefined) {
    validateRate(cachedInputUsdPerToken, "cachedInputUsdPerToken");
  }
  if (cacheCreationInputUsdPerToken !== undefined) {
    validateRate(cacheCreationInputUsdPerToken, "cacheCreationInputUsdPerToken");
  }
  return {
    inputUsdPerToken,
    outputUsdPerToken,
    ...(cachedInputUsdPerToken !== undefined ? { cachedInputUsdPerToken } : {}),
    ...(cacheCreationInputUsdPerToken !== undefined ? { cacheCreationInputUsdPerToken } : {}),
  };
}

/**
 * Resolves pricing from a map, trying common key variants.
 *
 * Example: if you pass `openai/gpt-5.2`, it will also try `gpt-5.2`.
 */
export function resolvePricingFromMap(map: PricingMap, modelId: string): Pricing | null {
  const candidates = modelIdCandidates(modelId, [
    "openai",
    "google",
    "anthropic",
    "xai",
    "meta",
    "mistral",
  ]);
  for (const key of candidates) {
    const pricing = Object.hasOwn(map, key) ? map[key] : undefined;
    if (pricing) return pricing;
  }
  return null;
}
