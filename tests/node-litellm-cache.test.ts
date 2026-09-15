import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { onTestFinished } from "vitest";
import { loadLiteLlmCatalog } from "../src/node/litellm.js";

const catalog = { model: { input_cost_per_token: 1e-6, output_cost_per_token: 2e-6 } };
const catalogFile = "litellm-model_prices_and_context_window.json";
const metaFile = "litellm-model_prices_and_context_window.meta.json";
const staleTime = 7 * 24 * 60 * 60 * 1000 + 2;

async function cacheDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "tokentally-cache-test-"));
  onTestFinished(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

async function seedCache(directory: string): Promise<void> {
  await loadLiteLlmCatalog({
    env: { TOKENTALLY_CACHE_DIR: directory },
    fetchImpl: async () =>
      Response.json(catalog, {
        headers: { etag: '"v1"', "last-modified": "Mon, 01 Jan 2024 00:00:00 GMT" },
      }),
    nowMs: 1,
  });
}

describe("LiteLLM optional disk cache", () => {
  it("fetches when HOME and the cache override are absent", async () => {
    const fetchImpl = vi.fn(async () => Response.json(catalog));
    expect(await loadLiteLlmCatalog({ env: {}, fetchImpl })).toEqual({
      catalog,
      source: "network",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("retains network pricing when the cache directory cannot be created", async () => {
    const directory = await cacheDirectory();
    const blocked = path.join(directory, "file");
    await fs.writeFile(blocked, "not a directory");
    expect(
      await loadLiteLlmCatalog({
        env: { TOKENTALLY_CACHE_DIR: blocked },
        fetchImpl: async () => Response.json(catalog),
      }),
    ).toEqual({ catalog, source: "network" });
  });

  it("preserves the previous disk catalog and metadata if atomic replacement fails", async () => {
    const directory = await cacheDirectory();
    await seedCache(directory);
    const rename = vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("replacement failed"));
    onTestFinished(() => rename.mockRestore());
    const fresh = { newer: { input_cost_per_token: 3e-6, output_cost_per_token: 4e-6 } };
    expect(
      await loadLiteLlmCatalog({
        env: { TOKENTALLY_CACHE_DIR: directory },
        fetchImpl: async () => Response.json(fresh, { headers: { etag: '"v2"' } }),
        nowMs: staleTime,
      }),
    ).toEqual({ catalog: fresh, source: "network" });
    expect(JSON.parse(await fs.readFile(path.join(directory, catalogFile), "utf8"))).toEqual(
      catalog,
    );
    expect(JSON.parse(await fs.readFile(path.join(directory, metaFile), "utf8")).fetchedAtMs).toBe(
      1,
    );
    expect((await fs.readdir(directory)).sort()).toEqual([catalogFile, metaFile].sort());
  });

  it("does not revalidate a new body with old validators after metadata replacement fails", async () => {
    const directory = await cacheDirectory();
    await seedCache(directory);
    const originalRename = fs.rename;
    const rename = vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (to === path.join(directory, metaFile)) throw new Error("metadata replacement failed");
      return originalRename(from, to);
    });
    onTestFinished(() => rename.mockRestore());
    const fresh = { newer: { input_cost_per_token: 3e-6, output_cost_per_token: 4e-6 } };
    const env = { TOKENTALLY_CACHE_DIR: directory };
    expect(
      await loadLiteLlmCatalog({
        env,
        nowMs: staleTime,
        fetchImpl: async () => Response.json(fresh, { headers: { etag: '"v2"' } }),
      }),
    ).toEqual({ catalog: fresh, source: "network" });
    rename.mockRestore();
    const result = await loadLiteLlmCatalog({
      env,
      nowMs: staleTime + 1,
      fetchImpl: async (_input, init) => {
        expect(init?.headers).toEqual({});
        return Response.json(catalog, { headers: { etag: '"v1"' } });
      },
    });
    expect(result).toEqual({ catalog, source: "network" });
  });

  it("refetches even fresh metadata when its digest does not match the cached body", async () => {
    const directory = await cacheDirectory();
    await seedCache(directory);
    await fs.writeFile(path.join(directory, catalogFile), JSON.stringify({ other: {} }));
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toEqual({});
      return Response.json(catalog);
    });
    expect(
      await loadLiteLlmCatalog({ env: { TOKENTALLY_CACHE_DIR: directory }, fetchImpl, nowMs: 2 }),
    ).toEqual({ catalog, source: "network" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([2, staleTime])(
    "retains legacy cache TTL and upgrades unbound validators at time %s",
    async (nowMs) => {
      const directory = await cacheDirectory();
      await fs.writeFile(path.join(directory, catalogFile), JSON.stringify(catalog));
      await fs.writeFile(
        path.join(directory, metaFile),
        JSON.stringify({ fetchedAtMs: 1, etag: '"v1"' }),
      );
      const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.headers).toEqual({});
        return Response.json(catalog);
      });
      expect(
        await loadLiteLlmCatalog({ env: { TOKENTALLY_CACHE_DIR: directory }, fetchImpl, nowMs }),
      ).toEqual({ catalog, source: nowMs === 2 ? "cache" : "network" });
      expect(fetchImpl).toHaveBeenCalledTimes(nowMs === 2 ? 0 : 1);
      if (nowMs === staleTime)
        expect(
          JSON.parse(await fs.readFile(path.join(directory, metaFile), "utf8")).catalogSha256,
        ).toMatch(/^[a-f0-9]{64}$/);
    },
  );

  it("retains network pricing when metadata persistence fails", async () => {
    const directory = await cacheDirectory();
    await fs.mkdir(path.join(directory, metaFile));
    expect(
      await loadLiteLlmCatalog({
        env: { TOKENTALLY_CACHE_DIR: directory },
        fetchImpl: async () => Response.json(catalog),
      }),
    ).toEqual({ catalog, source: "network" });
    expect(JSON.parse(await fs.readFile(path.join(directory, catalogFile), "utf8"))).toEqual(
      catalog,
    );
  });

  it.each(
    [null, "not JSON", "[]"].flatMap((cached) =>
      [2, staleTime].map((nowMs) => ({ cached, nowMs })),
    ),
  )(
    "fetches without validators for unusable $cached catalog at time $nowMs",
    async ({ cached, nowMs }) => {
      const directory = await cacheDirectory();
      await seedCache(directory);
      if (cached === null) await fs.unlink(path.join(directory, catalogFile));
      else await fs.writeFile(path.join(directory, catalogFile), cached);
      const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.headers).toEqual({});
        return Response.json(catalog);
      });
      expect(
        await loadLiteLlmCatalog({
          env: { TOKENTALLY_CACHE_DIR: directory },
          fetchImpl,
          nowMs,
        }),
      ).toEqual({ catalog, source: "network" });
      expect(fetchImpl).toHaveBeenCalledOnce();
    },
  );

  it("revalidates a stale readable catalog and refreshes its TTL on 304", async () => {
    const directory = await cacheDirectory();
    await seedCache(directory);
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toEqual({
        "if-none-match": '"v1"',
        "if-modified-since": "Mon, 01 Jan 2024 00:00:00 GMT",
      });
      return new Response(null, { status: 304 });
    });
    const env = { TOKENTALLY_CACHE_DIR: directory };
    expect(await loadLiteLlmCatalog({ env, fetchImpl, nowMs: staleTime })).toEqual({
      catalog,
      source: "cache",
    });
    expect(await loadLiteLlmCatalog({ env, fetchImpl, nowMs: staleTime + 1 })).toEqual({
      catalog,
      source: "cache",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each(["network", "http", "json", "catalog"])(
    "preserves a stale readable catalog after a %s failure",
    async (failure) => {
      const directory = await cacheDirectory();
      await seedCache(directory);
      const fetchImpl = async () => {
        if (failure === "network") throw new Error("offline");
        if (failure === "http") return new Response(null, { status: 503 });
        if (failure === "json") return new Response("invalid JSON");
        return Response.json([]);
      };
      expect(
        await loadLiteLlmCatalog({
          env: { TOKENTALLY_CACHE_DIR: directory },
          fetchImpl,
          nowMs: staleTime,
        }),
      ).toEqual({ catalog, source: "cache" });
    },
  );

  it("ignores malformed metadata instead of passing invalid header values to fetch", async () => {
    const directory = await cacheDirectory();
    await seedCache(directory);
    await fs.writeFile(
      path.join(directory, metaFile),
      JSON.stringify({ fetchedAtMs: 1, etag: 42, lastModified: {} }),
    );
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toEqual({});
      return Response.json(catalog);
    };
    expect(
      await loadLiteLlmCatalog({
        env: { TOKENTALLY_CACHE_DIR: directory },
        fetchImpl,
        nowMs: staleTime,
      }),
    ).toEqual({ catalog, source: "network" });
  });

  it("returns none when neither a network result nor disk cache is available", async () => {
    expect(
      await loadLiteLlmCatalog({
        env: {},
        fetchImpl: async () => {
          throw new Error("offline");
        },
      }),
    ).toEqual({ catalog: null, source: "none" });
  });
});

const malformedCatalogs = [
  {},
  { error: "temporary upstream failure" },
  { error: { message: "temporary upstream failure" } },
  { model: null },
  { model: [] },
  { model: { input_cost_per_token: "invalid", max_tokens: -1 } },
  { sample_spec: { input_cost_per_token: 0, output_cost_per_token: 0 } },
];

describe("LiteLLM catalog validation", () => {
  it.each(malformedCatalogs)(
    "preserves stale pricing after an unusable refresh %j",
    async (body) => {
      const directory = await cacheDirectory();
      await seedCache(directory);
      const env = { TOKENTALLY_CACHE_DIR: directory };
      const originalCatalog = await fs.readFile(path.join(directory, catalogFile), "utf8");
      const originalMeta = await fs.readFile(path.join(directory, metaFile), "utf8");
      expect(
        await loadLiteLlmCatalog({
          env,
          nowMs: staleTime,
          fetchImpl: async () => Response.json(body, { headers: { etag: '"broken"' } }),
        }),
      ).toEqual({ catalog, source: "cache" });
      expect(await fs.readFile(path.join(directory, catalogFile), "utf8")).toBe(originalCatalog);
      expect(await fs.readFile(path.join(directory, metaFile), "utf8")).toBe(originalMeta);
      const fetchImpl = vi.fn(async () => Response.json(catalog));
      expect(await loadLiteLlmCatalog({ env, nowMs: staleTime + 1, fetchImpl })).toEqual({
        catalog,
        source: "network",
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
    },
  );

  it.each(malformedCatalogs)("does not cache unusable first responses %j", async (body) => {
    const directory = await cacheDirectory();
    expect(
      await loadLiteLlmCatalog({
        env: { TOKENTALLY_CACHE_DIR: directory },
        fetchImpl: async () => Response.json(body),
      }),
    ).toEqual({ catalog: null, source: "none" });
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it.each(malformedCatalogs)("refetches unusable legacy cache contents %j", async (body) => {
    const directory = await cacheDirectory();
    await fs.writeFile(path.join(directory, catalogFile), JSON.stringify(body));
    await fs.writeFile(path.join(directory, metaFile), JSON.stringify({ fetchedAtMs: 1 }));
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toEqual({});
      return Response.json(catalog);
    });
    expect(
      await loadLiteLlmCatalog({ env: { TOKENTALLY_CACHE_DIR: directory }, nowMs: 2, fetchImpl }),
    ).toEqual({ catalog, source: "network" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([
    { embedding: { input_cost_per_token: 1e-6 } },
    { free: { input_cost_per_token: 0, output_cost_per_token: 0 } },
    { limits: { max_input_tokens: "8192" } },
    { limits: { max_output_tokens: 1024 } },
    { limits: { max_tokens: "4096" } },
    { ...catalog, extension: { custom: true }, sample_spec: { input_cost_per_token: 0 } },
  ])("retains partial model rows and extension data %j", async (body) => {
    const directory = await cacheDirectory();
    const env = { TOKENTALLY_CACHE_DIR: directory };
    const fetchImpl = vi.fn(async () => Response.json(body));
    expect(await loadLiteLlmCatalog({ env, fetchImpl, nowMs: 1 })).toEqual({
      catalog: body,
      source: "network",
    });
    expect(await loadLiteLlmCatalog({ env, fetchImpl, nowMs: 2 })).toEqual({
      catalog: body,
      source: "cache",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
