import { estimateUsdCost, pricingFromUsdPerMillion, tallyCosts } from "../src/index.js";
import { normalizeTokenUsage } from "../src/usage.js";

describe("explicit uncached input validation", () => {
  const pricing = pricingFromUsdPerMillion({
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 2,
    cachedInputUsdPerMillion: 0.1,
  });
  const direct = { inputTokens: 1000, outputTokens: 50, cachedInputTokens: 400 };
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

  it("preserves the ambiguous default estimate with one actionable structured warning", () => {
    for (let invocation = 0; invocation < 2; invocation++) {
      const cost = estimateUsdCost({ usage: direct, pricing });
      expect(cost?.totalUsd).toBeCloseTo(0.00114, 12);
      expect(cost?.warnings).toEqual([
        { code: "AMBIGUOUS_CACHED_INPUT", message: expect.stringMatching(error) },
      ]);
    }
    expect(
      estimateUsdCost({ usage: direct, pricing, requireExplicitUncachedInputTokens: false }),
    ).toEqual(estimateUsdCost({ usage: direct, pricing }));
  });

  it("rejects ambiguous direct estimates in strict mode", () => {
    expect(() =>
      estimateUsdCost({ usage: direct, pricing, requireExplicitUncachedInputTokens: true }),
    ).toThrow(TypeError);
    expect(() =>
      estimateUsdCost({ usage: direct, pricing, requireExplicitUncachedInputTokens: true }),
    ).toThrow(error);
  });

  it.each([false, true])(
    "prices explicit and provider-normalized input in strict=%s",
    async (strict) => {
      for (const [usage, expected] of [
        [explicit, 0.00074],
        [openai, 0.00074],
        [anthropic, 0.00114],
      ] as const) {
        const cost = estimateUsdCost({
          usage,
          pricing,
          requireExplicitUncachedInputTokens: strict,
        });
        expect(cost?.totalUsd).toBeCloseTo(expected, 12);
        expect(cost).not.toHaveProperty("warnings");
        const result = await tallyCosts({
          calls: [{ model: "example/model", usage }],
          resolvePricing: () => pricing,
          requireExplicitUncachedInputTokens: strict,
        });
        expect(result.total?.totalUsd).toBeCloseTo(expected, 12);
        expect(result).not.toHaveProperty("warnings");
      }
    },
  );

  it("warns for direct tallies and rejects them in strict mode", async () => {
    const calls = [{ model: "example/model", usage: direct }];
    const result = await tallyCosts({ calls, resolvePricing: () => pricing });
    expect(result.total?.totalUsd).toBeCloseTo(0.00114, 12);
    expect(result.warnings).toHaveLength(1);
    await expect(
      tallyCosts({
        calls,
        resolvePricing: () => pricing,
        requireExplicitUncachedInputTokens: true,
      }),
    ).rejects.toThrow(error);
  });

  it.each([false, true])(
    "detects mixed input before aggregation, reversed=%s",
    async (reversed) => {
      const calls = [direct, openai].map((usage) => ({ model: "example/model", usage }));
      if (reversed) calls.reverse();
      const result = await tallyCosts({ calls, resolvePricing: () => pricing });
      expect(result.total?.totalUsd).toBeCloseTo(0.00188, 12);
      expect(result.warnings?.map((warning) => warning.code)).toEqual(["AMBIGUOUS_CACHED_INPUT"]);
      const resolvePricing = vi.fn(() => pricing);
      await expect(
        tallyCosts({
          calls,
          resolvePricing,
          requireExplicitUncachedInputTokens: true,
        }),
      ).rejects.toThrow(error);
      expect(resolvePricing).not.toHaveBeenCalled();
      const corrected = await tallyCosts({
        calls: [explicit, openai].map((usage) => ({ model: "example/model", usage })),
        resolvePricing,
        requireExplicitUncachedInputTokens: true,
      });
      expect(corrected.total?.totalUsd).toBeCloseTo(0.00148, 12);
      expect(corrected).not.toHaveProperty("warnings");
    },
  );

  it("deduplicates warnings across calls and models even without pricing", async () => {
    const result = await tallyCosts({
      calls: ["a", "a", "b"].map((model) => ({ model, usage: direct })),
      resolvePricing: () => null,
    });
    expect(result.total).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.byModel.a?.calls).toBe(2);
  });

  it.each([
    { cachedInputTokens: 0 },
    { cacheCreationInputTokens: 0 },
    { cacheCreationInputTokens: 400 },
  ])("validates present cache fields %j and accepts explicit zero uncached input", (cache) => {
    const usage = { inputTokens: 0, outputTokens: 0, ...cache };
    expect(estimateUsdCost({ usage, pricing })?.warnings).toHaveLength(1);
    expect(() =>
      estimateUsdCost({ usage, pricing, requireExplicitUncachedInputTokens: true }),
    ).toThrow(error);
    expect(
      estimateUsdCost({
        usage: { ...usage, uncachedInputTokens: 0 },
        pricing,
        requireExplicitUncachedInputTokens: true,
      }),
    ).not.toHaveProperty("warnings");
  });

  it("keeps missing-data defaults and validates strict input before missing pricing", () => {
    expect(estimateUsdCost({ usage: direct, pricing: null })).toBeNull();
    expect(
      estimateUsdCost({ usage: null, pricing, requireExplicitUncachedInputTokens: true }),
    ).toBeNull();
    expect(() =>
      estimateUsdCost({
        usage: direct,
        pricing: null,
        requireExplicitUncachedInputTokens: true,
      }),
    ).toThrow(error);
    const cost = estimateUsdCost({
      usage: { inputTokens: 1000, outputTokens: 50 },
      pricing,
      requireExplicitUncachedInputTokens: true,
    });
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
