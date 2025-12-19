export type TokenUsageNormalized = {
	inputTokens: number;
	outputTokens: number;
	reasoningTokens?: number;
	totalTokens?: number;
};

export type Pricing = {
	inputUsdPerToken: number;
	outputUsdPerToken: number;
};

export type PricingMap = Record<string, Pricing | undefined>;

export type PricingResolver = (modelId: string) => Pricing | null | Promise<Pricing | null>;

export type CostBreakdown = {
	inputUsd: number;
	outputUsd: number;
	totalUsd: number;
};
