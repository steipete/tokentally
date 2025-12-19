import { fetchOpenRouterPricingMap } from "../src/node/openrouter.js";

describe("tokentally/node openrouter", () => {
	it("fetches and converts pricing map", async () => {
		const fetchImpl = async () =>
			new Response(
				JSON.stringify({
					data: [
						{ id: "openai/gpt-5.2", pricing: { prompt: 2, completion: 10 } },
						{ id: "xai/grok-4", pricing: { prompt: 3, completion: 15 } },
					],
				}),
				{ status: 200 },
			);

		const map = await fetchOpenRouterPricingMap({
			apiKey: "test",
			fetchImpl,
			ttlMs: 1_000_000,
		});
		expect(map["openai/gpt-5.2"]?.inputUsdPerToken).toBeCloseTo(2 / 1_000_000);
		expect(map["openai/gpt-5.2"]?.outputUsdPerToken).toBeCloseTo(10 / 1_000_000);
	});
});
