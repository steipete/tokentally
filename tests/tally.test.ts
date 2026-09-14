import { estimateUsdCost, pricingFromUsdPerMillion, tallyCosts } from "../src/index.js";
import type { TokenUsageNormalized } from "../src/index.js";
import { normalizeTokenUsage } from "../src/usage.js";

describe("explicit uncached input validation", () => {
  const pricing = pricingFromUsdPerMillion({
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 2,
    cachedInputUsdPerMillion: 0.1,
  });
  // Bypass the public type to exercise JavaScript and external-data callers.
  const direct = {
    inputTokens: 1000,
    outputTokens: 50,
    cachedInputTokens: 400,
  } as TokenUsageNormalized;
  const explicit = { ...direct, uncachedInputTokens: 600 };
  const openai = normalizeTokenUsage({
    prompt_tokens: 1000,
    completion_tokens: 50,
    prompt_tokens_details: { cached_tokens: 400 },
  });
  const anthropic = normalizeTokenUsage({
    input_tokens: 1000,
    output_tokens: 50,
    cache_read_input_tokens: 400,
  });
  const error = /normalizeTokenUsage\(\).*explicit uncachedInputTokens/;

  it.each([undefined, false, true])(
    "rejects ambiguous estimates with the deprecated flag set to %s",
    (flag) => {
      const estimate = () =>
        estimateUsdCost({ usage: direct, pricing, requireExplicitUncachedInputTokens: flag });
      expect(estimate).toThrow(TypeError);
      expect(estimate).toThrow(error);
    },
  );

  it.each([undefined, false, true])(
    "prices explicit and provider-normalized input with the deprecated flag set to %s",
    async (flag) => {
      for (const [usage, expected] of [
        [explicit, 0.00074],
        [openai, 0.00074],
        [anthropic, 0.00114],
      ] as const) {
        const cost = estimateUsdCost({
          usage,
          pricing,
          requireExplicitUncachedInputTokens: flag,
        });
        expect(cost?.totalUsd).toBeCloseTo(expected, 12);
        expect(cost).not.toHaveProperty("warnings");
        const result = await tallyCosts({
          calls: [{ model: "example/model", usage }],
          resolvePricing: () => pricing,
          requireExplicitUncachedInputTokens: flag,
        });
        expect(result.total?.totalUsd).toBeCloseTo(expected, 12);
        expect(result).not.toHaveProperty("warnings");
      }
    },
  );

  it.each([undefined, false, true])(
    "rejects direct tallies with the deprecated flag set to %s",
    async (flag) => {
      await expect(
        tallyCosts({
          calls: [{ model: "example/model", usage: direct }],
          resolvePricing: () => pricing,
          requireExplicitUncachedInputTokens: flag,
        }),
      ).rejects.toThrow(error);
    },
  );

  it.each([false, true])(
    "rejects mixed input before aggregation or pricing, reversed=%s",
    async (reversed) => {
      const calls = [direct, openai].map((usage) => ({ model: "example/model", usage }));
      if (reversed) calls.reverse();
      const resolvePricing = vi.fn(() => pricing);
      await expect(tallyCosts({ calls, resolvePricing })).rejects.toThrow(error);
      expect(resolvePricing).not.toHaveBeenCalled();
      const corrected = await tallyCosts({
        calls: [explicit, openai].map((usage) => ({ model: "example/model", usage })),
        resolvePricing,
      });
      expect(corrected.total?.totalUsd).toBeCloseTo(0.00148, 12);
      expect(corrected).not.toHaveProperty("warnings");
    },
  );

  it("rejects ambiguous calls even without pricing", async () => {
    const resolvePricing = vi.fn(() => null);
    await expect(
      tallyCosts({
        calls: ["a", "a", "b"].map((model) => ({ model, usage: direct })),
        resolvePricing,
      }),
    ).rejects.toThrow(error);
    expect(resolvePricing).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "combines cache-free and normalized usage, reversed=%s",
    async (reversed) => {
      const calls = [openai, { inputTokens: 1000, outputTokens: 50 }].map((usage) => ({
        model: "example/model",
        usage,
      }));
      if (reversed) calls.reverse();
      const result = await tallyCosts({ calls, resolvePricing: () => pricing });
      expect(result.total?.totalUsd).toBeCloseTo(0.00184, 12);
      expect(result.byModel["example/model"]?.usage.uncachedInputTokens).toBe(1600);
      expect(result.byModel["example/model"]?.usage.cachedInputTokens).toBe(400);
    },
  );

  it.each([
    { cachedInputTokens: 0 },
    { cacheCreationInputTokens: 0 },
    { cacheCreationInputTokens: 400 },
    { cachedInputTokens: 400, cacheCreationInputTokens: 200 },
  ])(
    "validates present cache fields %j and accepts explicit zero uncached input",
    async (cache) => {
      const usage = { inputTokens: 0, outputTokens: 0, ...cache } as TokenUsageNormalized;
      expect(() => estimateUsdCost({ usage, pricing })).toThrow(error);
      await expect(
        tallyCosts({ calls: [{ model: "example/model", usage }], resolvePricing: () => pricing }),
      ).rejects.toThrow(error);
      expect(
        estimateUsdCost({ usage: { ...usage, uncachedInputTokens: 0 }, pricing }),
      ).not.toHaveProperty("warnings");
    },
  );

  it("keeps missing-data defaults and validates input before missing pricing", () => {
    expect(estimateUsdCost({ usage: null, pricing })).toBeNull();
    expect(estimateUsdCost({ usage: explicit, pricing: null })).toBeNull();
    expect(() => estimateUsdCost({ usage: direct, pricing: null })).toThrow(error);
    const cost = estimateUsdCost({ usage: { inputTokens: 1000, outputTokens: 50 }, pricing });
    expect(cost?.inputUsd).toBeCloseTo(0.001, 12);
    expect(cost?.outputUsd).toBeCloseTo(0.0001, 12);
    expect(cost?.totalUsd).toBeCloseTo(0.0011, 12);
    expect(cost).not.toHaveProperty("warnings");
  });
});

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
