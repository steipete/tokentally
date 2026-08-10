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
        model: "provider/model-b",
        usage: normalizeTokenUsage({ input_tokens: 10, output_tokens: 5 }),
      },
    ];

    const pricingMap: Record<string, ReturnType<typeof pricingFromUsdPerMillion>> = {
      "openai/gpt-5.2": pricingFromUsdPerMillion({ inputUsdPerMillion: 2, outputUsdPerMillion: 4 }),
      "provider/model-b": pricingFromUsdPerMillion({
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

    expect(result.byModel["provider/model-b"]?.calls).toBe(1);
    expect(result.byModel["provider/model-b"]?.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      reasoningTokens: 0,
      totalTokens: 15,
    });

    const expectedOpenAi = estimateUsdCost({
      usage: result.byModel["openai/gpt-5.2"]?.usage ?? null,
      pricing: pricingMap["openai/gpt-5.2"],
    });
    const expectedModelB = estimateUsdCost({
      usage: result.byModel["provider/model-b"]?.usage ?? null,
      pricing: pricingMap["provider/model-b"],
    });
    expect(result.total?.totalUsd).toBeCloseTo(
      (expectedOpenAi?.totalUsd ?? 0) + (expectedModelB?.totalUsd ?? 0),
    );
  });

  it("aggregates cached input and reasoning token details", async () => {
    const result = await tallyCosts({
      calls: [
        {
          model: "openai/gpt-5.2",
          usage: normalizeTokenUsage({
            prompt_tokens: 100,
            completion_tokens: 25,
            prompt_tokens_details: { cached_tokens: 50 },
            completion_tokens_details: { reasoning_tokens: 8 },
          }),
        },
        {
          model: "openai/gpt-5.2",
          usage: normalizeTokenUsage({
            prompt_tokens: 40,
            completion_tokens: 10,
            prompt_tokens_details: { cached_tokens: 12 },
            completion_tokens_details: { reasoning_tokens: 3 },
          }),
        },
      ],
      resolvePricing: () =>
        pricingFromUsdPerMillion({ inputUsdPerMillion: 1, outputUsdPerMillion: 2 }),
    });

    expect(result.byModel["openai/gpt-5.2"]?.usage).toEqual({
      inputTokens: 140,
      outputTokens: 35,
      uncachedInputTokens: 78,
      cachedInputTokens: 62,
      reasoningTokens: 11,
      totalTokens: 175,
    });
  });

  it("prices cache-heavy Anthropic usage from published cache rates", () => {
    const usage = normalizeTokenUsage({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 20,
      cache_read_input_tokens: 500,
    });
    const pricing = pricingFromUsdPerMillion({
      inputUsdPerMillion: 3,
      outputUsdPerMillion: 15,
      cachedInputUsdPerMillion: 0.3,
      cacheCreationInputUsdPerMillion: 3.75,
    });

    const cost = estimateUsdCost({ usage, pricing });
    const oldTotal = 100 * (3 / 1_000_000) + 50 * (15 / 1_000_000);
    const expectedTotal = oldTotal + 500 * (0.3 / 1_000_000) + 20 * (3.75 / 1_000_000);

    expect(oldTotal).toBeCloseTo(0.00105);
    expect(cost?.totalUsd).toBeGreaterThan(oldTotal);
    expect(cost?.inputUsd).toBeCloseTo(0.000525);
    expect(cost?.outputUsd).toBeCloseTo(0.00075);
    expect(cost?.totalUsd).toBeCloseTo(expectedTotal);
    expect(cost?.totalUsd).toBeCloseTo(0.001275);
  });

  it("falls back to ordinary input pricing when cache rates are unpublished", () => {
    const usage = normalizeTokenUsage({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 20,
      cache_read_input_tokens: 500,
    });
    const pricing = pricingFromUsdPerMillion({ inputUsdPerMillion: 3, outputUsdPerMillion: 15 });

    expect(estimateUsdCost({ usage, pricing })?.totalUsd).toBeCloseTo(0.00261);
  });

  it("does not double-price cache reads already included in OpenAI input", () => {
    const usage = normalizeTokenUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      prompt_tokens_details: { cached_tokens: 80 },
    });
    const pricing = pricingFromUsdPerMillion({
      inputUsdPerMillion: 3,
      outputUsdPerMillion: 15,
      cachedInputUsdPerMillion: 0.3,
    });

    expect(estimateUsdCost({ usage, pricing })?.totalUsd).toBeCloseTo(0.000834);
  });
});
