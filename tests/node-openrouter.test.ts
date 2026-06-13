import {
  fetchOpenRouterPricingMap,
  openRouterPricingMapFromCatalog,
} from "../src/node/openrouter.js";

describe("tokentally/node openrouter", () => {
  it("parses OpenRouter's USD-per-token string pricing", async () => {
    // OpenRouter's /api/v1/models returns pricing as USD-per-token *strings*,
    // e.g. "0.000005" for a model that costs $5 / 1M input tokens.
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "anthropic/claude-opus-4.8",
              pricing: { prompt: "0.000005", completion: "0.000025" },
            },
            {
              id: "openai/gpt-4o-mini",
              pricing: { prompt: "0.00000015", completion: "0.0000006" },
            },
          ],
        }),
        { status: 200 },
      );

    const map = await fetchOpenRouterPricingMap({
      apiKey: "test",
      fetchImpl,
      ttlMs: 1_000_000,
    });

    // Values are already per-token, so they pass through unchanged.
    expect(map["anthropic/claude-opus-4.8"]?.inputUsdPerToken).toBe(0.000005);
    expect(map["anthropic/claude-opus-4.8"]?.outputUsdPerToken).toBe(0.000025);
    expect(map["openai/gpt-4o-mini"]?.inputUsdPerToken).toBe(0.00000015);
    expect(map["openai/gpt-4o-mini"]?.outputUsdPerToken).toBe(0.0000006);
  });

  it("preserves numeric pricing as USD per million", () => {
    const map = openRouterPricingMapFromCatalog([
      { id: "x-ai/grok-4", pricing: { prompt: 3, completion: 15 } },
    ]);

    expect(map["x-ai/grok-4"]?.inputUsdPerToken).toBe(0.000003);
    expect(map["x-ai/grok-4"]?.outputUsdPerToken).toBe(0.000015);
  });

  it("accepts mixed string and numeric pricing without changing numeric units", () => {
    const map = openRouterPricingMapFromCatalog([
      { id: "mixed/model", pricing: { prompt: "0.000004", completion: 12 } },
    ]);

    expect(map["mixed/model"]?.inputUsdPerToken).toBe(0.000004);
    expect(map["mixed/model"]?.outputUsdPerToken).toBe(0.000012);
  });

  it("keeps free models priced at zero", () => {
    const map = openRouterPricingMapFromCatalog([
      { id: "free/model", pricing: { prompt: "0", completion: "0" } },
    ]);

    expect(map["free/model"]?.inputUsdPerToken).toBe(0);
    expect(map["free/model"]?.outputUsdPerToken).toBe(0);
  });

  it("skips entries with malformed or missing pricing", () => {
    const map = openRouterPricingMapFromCatalog([
      { id: "broken/model", pricing: { prompt: "abc", completion: "1" } },
      { id: "missing/model" },
    ]);

    expect(map["broken/model"]).toBeUndefined();
    expect(map["missing/model"]).toBeUndefined();
  });
});
