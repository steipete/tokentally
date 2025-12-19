import type { Pricing, PricingMap } from "./types.js";

/**
 * Convenience helper for pricing tables that publish USD per 1M tokens.
 *
 * Example: input $1.75 / 1M, output $14.00 / 1M.
 */
export function pricingFromUsdPerMillion({
	inputUsdPerMillion,
	outputUsdPerMillion,
}: {
	inputUsdPerMillion: number;
	outputUsdPerMillion: number;
}): Pricing {
	if (!Number.isFinite(inputUsdPerMillion) || inputUsdPerMillion < 0) {
		throw new Error("inputUsdPerMillion must be a finite, non-negative number");
	}
	if (!Number.isFinite(outputUsdPerMillion) || outputUsdPerMillion < 0) {
		throw new Error("outputUsdPerMillion must be a finite, non-negative number");
	}
	return {
		inputUsdPerToken: inputUsdPerMillion / 1_000_000,
		outputUsdPerToken: outputUsdPerMillion / 1_000_000,
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
}: {
	inputUsdPerToken: number;
	outputUsdPerToken: number;
}): Pricing {
	if (!Number.isFinite(inputUsdPerToken) || inputUsdPerToken < 0) {
		throw new Error("inputUsdPerToken must be a finite, non-negative number");
	}
	if (!Number.isFinite(outputUsdPerToken) || outputUsdPerToken < 0) {
		throw new Error("outputUsdPerToken must be a finite, non-negative number");
	}
	return { inputUsdPerToken, outputUsdPerToken };
}

function normalizeCandidateKeys(modelId: string): string[] {
	const trimmed = modelId.trim();
	if (!trimmed) return [];

	const candidates = [trimmed];
	if (trimmed.startsWith("openai/")) candidates.push(trimmed.slice("openai/".length));
	if (trimmed.startsWith("google/")) candidates.push(trimmed.slice("google/".length));
	if (trimmed.startsWith("anthropic/")) candidates.push(trimmed.slice("anthropic/".length));
	if (trimmed.startsWith("xai/")) candidates.push(trimmed.slice("xai/".length));
	if (trimmed.startsWith("meta/")) candidates.push(trimmed.slice("meta/".length));
	if (trimmed.startsWith("mistral/")) candidates.push(trimmed.slice("mistral/".length));

	return candidates;
}

/**
 * Resolves pricing from a map, trying common key variants.
 *
 * Example: if you pass `openai/gpt-5.2`, it will also try `gpt-5.2`.
 */
export function resolvePricingFromMap(map: PricingMap, modelId: string): Pricing | null {
	const candidates = normalizeCandidateKeys(modelId);
	for (const key of candidates) {
		const pricing = map[key];
		if (pricing) return pricing;
	}
	return null;
}
