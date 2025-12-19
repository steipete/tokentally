import { normalizeTokenUsage } from "../src/usage.js";

describe("normalizeTokenUsage", () => {
	it("returns null for non-objects", () => {
		expect(normalizeTokenUsage(null)).toBeNull();
		expect(normalizeTokenUsage(undefined)).toBeNull();
		expect(normalizeTokenUsage("x")).toBeNull();
		expect(normalizeTokenUsage(123)).toBeNull();
	});

	it("normalizes AI SDK style usage", () => {
		expect(normalizeTokenUsage({ promptTokens: 10, completionTokens: 3, totalTokens: 13 })).toEqual(
			{ inputTokens: 10, outputTokens: 3, totalTokens: 13 },
		);
	});

	it("normalizes OpenAI responses usage", () => {
		expect(
			normalizeTokenUsage({
				input_tokens: 100,
				output_tokens: 20,
				reasoning_tokens: 5,
				total_tokens: 125,
			}),
		).toEqual({ inputTokens: 100, outputTokens: 20, reasoningTokens: 5, totalTokens: 125 });
	});

	it("fills missing totals", () => {
		expect(normalizeTokenUsage({ prompt_tokens: 7, completion_tokens: 2 })).toEqual({
			inputTokens: 7,
			outputTokens: 2,
			totalTokens: 9,
		});
	});

	it("treats missing input/output as 0 but keeps total when provided", () => {
		expect(normalizeTokenUsage({ total_tokens: 9 })).toEqual({
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 9,
		});
	});

	it("floors non-integer values", () => {
		expect(normalizeTokenUsage({ promptTokens: 1.9, completionTokens: 2.1 })).toEqual({
			inputTokens: 1,
			outputTokens: 2,
			totalTokens: 3,
		});
	});
});
