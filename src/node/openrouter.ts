import { pricingFromUsdPerMillion } from "../pricing.js";
import type { PricingMap } from "../types.js";
import type { FetchFn } from "./types.js";

const OPENROUTER_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";

/** Minimal subset of OpenRouter model info used for pricing + limits. */
export type OpenRouterModelInfo = {
	id: string;
	context_length?: number;
	pricing?: {
		prompt?: number;
		completion?: number;
	};
};

const catalogCache = new Map<string, { fetchedAt: number; models: OpenRouterModelInfo[] }>();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Fetches the OpenRouter model catalog (cached in-memory per `apiKey`).
 *
 * Note: OpenRouter pricing values are USD per 1M tokens.
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
 * Converts OpenRouter's catalog pricing to a `PricingMap`.
 *
 * Entries without pricing are skipped.
 */
export function openRouterPricingMapFromCatalog(catalog: OpenRouterModelInfo[]): PricingMap {
	const map: PricingMap = {};
	for (const entry of catalog) {
		const prompt = entry.pricing?.prompt;
		const completion = entry.pricing?.completion;
		if (
			typeof prompt === "number" &&
			Number.isFinite(prompt) &&
			prompt >= 0 &&
			typeof completion === "number" &&
			Number.isFinite(completion) &&
			completion >= 0
		) {
			map[entry.id] = pricingFromUsdPerMillion({
				inputUsdPerMillion: prompt,
				outputUsdPerMillion: completion,
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
