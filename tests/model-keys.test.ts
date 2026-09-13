import { pricingFromUsdPerToken, resolvePricingFromMap, tallyCosts } from "../src/index.js";
import {
  openRouterPricingMapFromCatalog,
  resolveLiteLlmMaxInputTokens,
  resolveLiteLlmMaxOutputTokens,
  resolveLiteLlmPricing,
  type LiteLlmCatalog,
} from "../src/node/index.js";

const pricing = pricingFromUsdPerToken({ inputUsdPerToken: 1e-6, outputUsdPerToken: 2e-6 });
const modelIds = ["__proto__", "constructor", "toString"];

describe("model dictionary keys", () => {
  it.each(modelIds)("does not resolve inherited pricing for %s", (model) => {
    expect(resolvePricingFromMap({}, model)).toBeNull();
    expect(resolvePricingFromMap({}, `openai/${model}`)).toBeNull();
  });

  it("retains special OpenRouter IDs as own entries with last-row precedence", () => {
    const map = openRouterPricingMapFromCatalog([
      { id: "__proto__", pricing: { prompt: "0.01", completion: "0.02" } },
      ...modelIds.map((id) => ({ id, pricing: { prompt: "0.000001", completion: "0.000002" } })),
    ]);
    expect(Object.getPrototypeOf(map)).toBe(Object.prototype);
    expect(Object.keys(map)).toEqual(modelIds);
    for (const model of modelIds) {
      expect(Object.hasOwn(map, model)).toBe(true);
      expect(resolvePricingFromMap(map, model)).toEqual(pricing);
      expect(JSON.parse(JSON.stringify(map))[model]).toEqual(pricing);
    }
  });

  it("tallies arbitrary IDs without treating prototype properties as rows", async () => {
    const prototypeKeys = Object.getOwnPropertyNames(Object.prototype);
    const result = await tallyCosts({
      calls: modelIds.flatMap((model) => [
        { model, usage: { inputTokens: 100, outputTokens: 50 } },
        { model, usage: null },
      ]),
      resolvePricing: () => pricing,
    });
    expect(Object.getPrototypeOf(result.byModel)).toBe(Object.prototype);
    expect(Object.keys(result.byModel)).toEqual(modelIds);
    for (const model of modelIds) {
      expect(result.byModel[model].calls).toBe(2);
      expect(result.byModel[model].cost?.totalUsd).toBeCloseTo(0.0002, 12);
    }
    expect(result.total?.totalUsd).toBeCloseTo(0.0006, 12);
    expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(prototypeKeys);
  });

  it("preserves resolver ordering for numeric model IDs", async () => {
    const resolvePricing = vi.fn(() => pricing);
    await tallyCosts({
      calls: ["2", "1"].map((model) => ({ model, usage: null })),
      resolvePricing,
    });
    expect(resolvePricing.mock.calls).toEqual([["1"], ["2"]]);
  });

  it("ignores inherited LiteLLM rows but accepts own special keys", () => {
    const row = {
      input_cost_per_token: 1e-6,
      output_cost_per_token: 2e-6,
      max_input_tokens: 100,
      max_tokens: 20,
    };
    const catalog: LiteLlmCatalog = Object.create({ inherited: row });
    Object.defineProperty(catalog, "__proto__", { value: row, enumerable: true });
    expect(resolveLiteLlmPricing(catalog, "inherited")).toBeNull();
    expect(resolveLiteLlmMaxInputTokens(catalog, "inherited")).toBeNull();
    expect(resolveLiteLlmMaxOutputTokens(catalog, "inherited")).toBeNull();
    expect(resolveLiteLlmPricing(catalog, "__proto__")).toEqual(pricing);
    expect(resolveLiteLlmMaxInputTokens(catalog, "__proto__")).toBe(100);
    expect(resolveLiteLlmMaxOutputTokens(catalog, "__proto__")).toBe(20);
  });
});
