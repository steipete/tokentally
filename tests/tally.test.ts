import { estimateUsdCost, pricingFromUsdPerMillion, tallyCosts } from "../src/index.js";
import { normalizeTokenUsage } from "../src/usage.js";

describe("tallyCosts", () => {
	it("computes totals and per-model breakdown", async () => {
		const calls = [
			{
				model: "openai/gpt-5.2",
				usage: normalizeTokenUsage({ promptTokens: 100, completionTokens: 50 }),
			},
			{
				model: "openai/gpt-5.2",
				usage: normalizeTokenUsage({ promptTokens: 20, completionTokens: 10 }),
			},
			{
				model: "xai/grok-4-1-fast",
				usage: normalizeTokenUsage({ input_tokens: 10, output_tokens: 5 }),
			},
		];

		const pricingMap: Record<string, ReturnType<typeof pricingFromUsdPerMillion>> = {
			"openai/gpt-5.2": pricingFromUsdPerMillion({ inputUsdPerMillion: 2, outputUsdPerMillion: 4 }),
			"xai/grok-4-1-fast": pricingFromUsdPerMillion({
				inputUsdPerMillion: 0.2,
				outputUsdPerMillion: 0.5,
			}),
		};

		const result = await tallyCosts({
			calls,
			resolvePricing: (modelId) => pricingMap[modelId] ?? null,
		});

		expect(result.byModel["openai/gpt-5.2"]?.calls).toBe(2);
		expect(result.byModel["openai/gpt-5.2"]?.usage).toEqual({
			inputTokens: 120,
			outputTokens: 60,
			reasoningTokens: 0,
			totalTokens: 180,
		});

		expect(result.byModel["xai/grok-4-1-fast"]?.calls).toBe(1);
		expect(result.byModel["xai/grok-4-1-fast"]?.usage).toEqual({
			inputTokens: 10,
			outputTokens: 5,
			reasoningTokens: 0,
			totalTokens: 15,
		});

		const expectedOpenAi = estimateUsdCost({
			usage: result.byModel["openai/gpt-5.2"]?.usage ?? null,
			pricing: pricingMap["openai/gpt-5.2"],
		});
		const expectedXai = estimateUsdCost({
			usage: result.byModel["xai/grok-4-1-fast"]?.usage ?? null,
			pricing: pricingMap["xai/grok-4-1-fast"],
		});
		expect(result.total?.totalUsd).toBeCloseTo(
			(expectedOpenAi?.totalUsd ?? 0) + (expectedXai?.totalUsd ?? 0),
		);
	});
});
