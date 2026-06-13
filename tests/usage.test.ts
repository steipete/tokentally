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

  it("normalizes nested OpenAI usage details", () => {
    expect(
      normalizeTokenUsage({
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        prompt_tokens_details: { cached_tokens: 40 },
        completion_tokens_details: { reasoning_tokens: 7 },
      }),
    ).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cachedInputTokens: 40,
      reasoningTokens: 7,
      totalTokens: 120,
    });
  });

  it("normalizes nested Responses API usage details", () => {
    expect(
      normalizeTokenUsage({
        input_tokens: 150,
        output_tokens: 30,
        total_tokens: 180,
        input_tokens_details: { cached_tokens: 25 },
        output_tokens_details: { reasoning_tokens: 12 },
      }),
    ).toEqual({
      inputTokens: 150,
      outputTokens: 30,
      cachedInputTokens: 25,
      reasoningTokens: 12,
      totalTokens: 180,
    });
  });

  it("accepts top-level cached input token aliases", () => {
    expect(normalizeTokenUsage({ inputTokens: 10, cached_input_tokens: 4 })).toEqual({
      inputTokens: 10,
      outputTokens: 0,
      cachedInputTokens: 4,
      totalTokens: 10,
    });
  });

  it("does not double-count nested reasoning when inferring totals", () => {
    expect(
      normalizeTokenUsage({
        prompt_tokens: 100,
        completion_tokens: 25,
        completion_tokens_details: { reasoning_tokens: 8 },
      }),
    ).toEqual({
      inputTokens: 100,
      outputTokens: 25,
      reasoningTokens: 8,
      totalTokens: 125,
    });
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
