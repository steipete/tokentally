import type { CostBreakdown, Pricing, PricingResolver, TokenUsageNormalized } from "./types.js";

/**
 * Estimates USD cost for a single call from normalized usage + pricing.
 *
 * Returns `null` if either `usage` or `pricing` is missing.
 */
export function estimateUsdCost({
	usage,
	pricing,
}: {
	usage: TokenUsageNormalized | null;
	pricing: Pricing | null;
}): CostBreakdown | null {
	if (!usage || !pricing) return null;
	const inputUsd = usage.inputTokens * pricing.inputUsdPerToken;
	const outputUsd = usage.outputTokens * pricing.outputUsdPerToken;
	return { inputUsd, outputUsd, totalUsd: inputUsd + outputUsd };
}

/** One model call to be tallied. */
export type TallyCall = {
	model: string;
	usage: TokenUsageNormalized | null;
};

/**
 * Aggregated tally output.
 *
 * - `total`: sum of all calls where pricing was resolvable
 * - `byModel`: counts + accumulated usage + (optional) cost per model
 */
export type TallyResult = {
	total: CostBreakdown | null;
	byModel: Record<
		string,
		{ calls: number; usage: TokenUsageNormalized; cost: CostBreakdown | null }
	>;
};

function addUsage(a: TokenUsageNormalized, b: TokenUsageNormalized): TokenUsageNormalized {
	return {
		inputTokens: a.inputTokens + b.inputTokens,
		outputTokens: a.outputTokens + b.outputTokens,
		reasoningTokens: (a.reasoningTokens ?? 0) + (b.reasoningTokens ?? 0),
		totalTokens: (a.totalTokens ?? 0) + (b.totalTokens ?? 0),
	};
}

function emptyUsage(): TokenUsageNormalized {
	return { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 };
}

/**
 * Tallies costs across a list of calls, grouped by `model`.
 *
 * `resolvePricing(modelId)` can be async (e.g. catalog fetch).
 */
export async function tallyCosts({
	calls,
	resolvePricing,
}: {
	calls: TallyCall[];
	resolvePricing: PricingResolver;
}): Promise<TallyResult> {
	const byModel: TallyResult["byModel"] = {};

	for (const call of calls) {
		const model = call.model;
		const usage = call.usage;
		if (!byModel[model]) {
			byModel[model] = { calls: 0, usage: emptyUsage(), cost: null };
		}
		byModel[model].calls += 1;
		if (usage) byModel[model].usage = addUsage(byModel[model].usage, usage);
	}

	let total: CostBreakdown | null = null;
	for (const [model, row] of Object.entries(byModel)) {
		const pricing = await resolvePricing(model);
		row.cost = estimateUsdCost({ usage: row.usage, pricing });
		if (row.cost) {
			if (!total) total = { inputUsd: 0, outputUsd: 0, totalUsd: 0 };
			total.inputUsd += row.cost.inputUsd;
			total.outputUsd += row.cost.outputUsd;
			total.totalUsd += row.cost.totalUsd;
		}
	}

	return { total, byModel };
}
