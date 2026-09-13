import { onTestFinished } from "vitest";
import {
  fetchOpenRouterModelCatalog,
  fetchOpenRouterPricingMap,
  openRouterPricingMapFromCatalog,
  type OpenRouterModelInfo,
} from "../src/node/openrouter.js";

const validModel = { id: "example/model", pricing: { prompt: "0.000001", completion: "0.000002" } };

describe("OpenRouter catalog validation and cache", () => {
  it.each([null, {}, [], { data: null }, { data: {} }, { data: "invalid" }])(
    "rejects malformed collection %j without poisoning the cache",
    async (payload) => {
      let calls = 0;
      const fetchImpl = async () => {
        calls += 1;
        return Response.json(calls === 1 ? payload : { data: [validModel] });
      };
      const params = { apiKey: `synthetic-invalid-${JSON.stringify(payload)}`, fetchImpl };
      await expect(fetchOpenRouterModelCatalog(params)).rejects.toThrow("expected a data array");
      expect(await fetchOpenRouterModelCatalog(params)).toEqual([validModel]);
      expect(await fetchOpenRouterModelCatalog(params)).toEqual([validModel]);
      expect(calls).toBe(2);
    },
  );

  it("skips invalid identities and cleans optional fields while preserving extension data", async () => {
    const fetchImpl = async () =>
      Response.json({
        data: [
          null,
          false,
          [],
          {},
          { id: 12 },
          {
            ...validModel,
            name: "Example",
            context_length: "invalid",
            pricing: { ...validModel.pricing, input_cache_read: null, extension: "retained" },
          },
        ],
      });
    const params = { apiKey: "synthetic-mixed-rows", fetchImpl };
    expect(await fetchOpenRouterModelCatalog(params)).toEqual([
      { ...validModel, name: "Example", pricing: { ...validModel.pricing, extension: "retained" } },
    ]);
    const map = await fetchOpenRouterPricingMap(params);
    expect(map[validModel.id]).toEqual({ inputUsdPerToken: 1e-6, outputUsdPerToken: 2e-6 });
  });

  it("accepts an empty catalog and retains valid context and numeric pricing", async () => {
    expect(
      await fetchOpenRouterModelCatalog({
        apiKey: "synthetic-empty",
        fetchImpl: async () => Response.json({ data: [] }),
      }),
    ).toEqual([]);
    const model = { id: "numeric", context_length: 8192, pricing: { prompt: 1, completion: 2 } };
    expect(
      await fetchOpenRouterModelCatalog({
        apiKey: "synthetic-numeric",
        fetchImpl: async () => Response.json({ data: [model] }),
      }),
    ).toEqual([model]);
  });

  it("ignores malformed offline rows without losing valid pricing", () => {
    const rows: unknown[] = [null, false, {}, { id: 42 }, validModel];
    expect(openRouterPricingMapFromCatalog(rows as OpenRouterModelInfo[])).toEqual({
      [validModel.id]: { inputUsdPerToken: 1e-6, outputUsdPerToken: 2e-6 },
    });
  });

  it("starts TTL when fetching completes, then expires normally", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const fetchImpl = vi.fn(async () => {
      vi.advanceTimersByTime(1000);
      return Response.json({ data: [validModel] });
    });
    const params = { apiKey: "synthetic-slow-fetch", fetchImpl, ttlMs: 100 };
    expect(await fetchOpenRouterModelCatalog(params)).toEqual([validModel]);
    vi.advanceTimersByTime(50);
    expect(await fetchOpenRouterModelCatalog(params)).toEqual([validModel]);
    expect(fetchImpl).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(51);
    expect(await fetchOpenRouterModelCatalog(params)).toEqual([validModel]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not cache HTTP failures", async () => {
    let calls = 0;
    const fetchImpl = async () =>
      ++calls === 1 ? new Response(null, { status: 503 }) : Response.json({ data: [validModel] });
    const params = { apiKey: "synthetic-http-failure", fetchImpl };
    await expect(fetchOpenRouterModelCatalog(params)).rejects.toThrow(
      "Failed to load OpenRouter models (503)",
    );
    expect(await fetchOpenRouterModelCatalog(params)).toEqual([validModel]);
    expect(calls).toBe(2);
  });
});
