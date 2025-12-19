import {
	pricingFromUsdPerMillion,
	pricingFromUsdPerToken,
	resolvePricingFromMap,
} from "../src/pricing.js";

describe("pricing", () => {
	it("converts per-million to per-token", () => {
		const pricing = pricingFromUsdPerMillion({ inputUsdPerMillion: 2, outputUsdPerMillion: 10 });
		expect(pricing.inputUsdPerToken).toBeCloseTo(2 / 1_000_000);
		expect(pricing.outputUsdPerToken).toBeCloseTo(10 / 1_000_000);
	});

	it("accepts per-token pricing", () => {
		const pricing = pricingFromUsdPerToken({ inputUsdPerToken: 0.001, outputUsdPerToken: 0.002 });
		expect(pricing).toEqual({ inputUsdPerToken: 0.001, outputUsdPerToken: 0.002 });
	});

	it("resolves pricing with provider prefix fallbacks", () => {
		const map = {
			"gpt-5.2": pricingFromUsdPerMillion({ inputUsdPerMillion: 1, outputUsdPerMillion: 2 }),
		};
		expect(resolvePricingFromMap(map, "openai/gpt-5.2")).toEqual(map["gpt-5.2"]);
		expect(resolvePricingFromMap(map, "gpt-5.2")).toEqual(map["gpt-5.2"]);
		expect(resolvePricingFromMap(map, "anthropic/claude-4.5-sonnet")).toBeNull();
	});
});
