import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
	loadLiteLlmCatalog,
	resolveLiteLlmMaxOutputTokens,
	resolveLiteLlmPricing,
} from "../src/node/litellm.js";

describe("tokentally/node litellm", () => {
	it("resolves pricing and output limit from catalog", () => {
		const catalog = {
			"openai/gpt-5.2": {
				input_cost_per_token: 1 / 1_000_000,
				output_cost_per_token: 2 / 1_000_000,
				max_output_tokens: 1234,
			},
		};
		expect(resolveLiteLlmPricing(catalog, "openai/gpt-5.2")).toEqual({
			inputUsdPerToken: 1 / 1_000_000,
			outputUsdPerToken: 2 / 1_000_000,
		});
		expect(resolveLiteLlmMaxOutputTokens(catalog, "openai/gpt-5.2")).toBe(1234);
	});

	it("caches catalog under TOKENTALLY_CACHE_DIR", async () => {
		const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tokentally-"));
		let calls = 0;
		const fetchImpl: typeof fetch = async () => {
			calls += 1;
			return new Response(
				JSON.stringify({
					"openai/gpt-5.2": {
						input_cost_per_token: 1e-6,
						output_cost_per_token: 2e-6,
						max_output_tokens: 10,
					},
				}),
				{ status: 200 },
			);
		};

		const env = { TOKENTALLY_CACHE_DIR: tmp } as Record<string, string | undefined>;
		const first = await loadLiteLlmCatalog({ env, fetchImpl, nowMs: 1 });
		const second = await loadLiteLlmCatalog({ env, fetchImpl, nowMs: 2 });

		expect(first.catalog).not.toBeNull();
		expect(second.catalog).not.toBeNull();
		expect(calls).toBe(1);
	});
});
