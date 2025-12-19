import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type { Pricing } from "../types.js";

const LITELLM_CATALOG_URL =
	"https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type LiteLlmModelRow = {
	input_cost_per_token?: number;
	output_cost_per_token?: number;
	max_output_tokens?: number | string;
	max_tokens?: number | string;
	max_input_tokens?: number | string;
	// keep parsing minimal; file contains many additional fields
};

export type LiteLlmCatalog = Record<string, LiteLlmModelRow | undefined>;

type CacheMeta = {
	fetchedAtMs: number;
	etag?: string;
	lastModified?: string;
};

function cachePaths(
	env: Record<string, string | undefined>,
): { catalogPath: string; metaPath: string } | null {
	const override = env.TOKENTALLY_CACHE_DIR?.trim();
	const home = env.HOME?.trim();
	const cacheDir =
		override && override.length > 0
			? override
			: home
				? path.join(home, ".tokentally", "cache")
				: null;
	if (!cacheDir) return null;
	return {
		catalogPath: path.join(cacheDir, "litellm-model_prices_and_context_window.json"),
		metaPath: path.join(cacheDir, "litellm-model_prices_and_context_window.meta.json"),
	};
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isStale(meta: CacheMeta | null, nowMs: number): boolean {
	if (!meta) return true;
	if (!Number.isFinite(meta.fetchedAtMs)) return true;
	return nowMs - meta.fetchedAtMs > CACHE_TTL_MS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCatalog(raw: unknown): LiteLlmCatalog | null {
	if (!isRecord(raw)) return null;
	return raw as LiteLlmCatalog;
}

export type LiteLlmLoadResult = {
	catalog: LiteLlmCatalog | null;
	source: "cache" | "network" | "none";
};

export async function loadLiteLlmCatalog({
	env,
	fetchImpl,
	nowMs = Date.now(),
}: {
	env: Record<string, string | undefined>;
	fetchImpl: typeof fetch;
	nowMs?: number;
}): Promise<LiteLlmLoadResult> {
	const paths = cachePaths(env);
	if (!paths) return { catalog: null, source: "none" };

	const { catalogPath, metaPath } = paths;
	const meta = await readJsonFile<CacheMeta>(metaPath);

	const cached = existsSync(catalogPath) ? await readJsonFile<unknown>(catalogPath) : null;
	const cachedCatalog = cached ? parseCatalog(cached) : null;

	if (cachedCatalog && !isStale(meta, nowMs)) {
		return { catalog: cachedCatalog, source: "cache" };
	}

	const headers: Record<string, string> = {};
	if (meta?.etag) headers["if-none-match"] = meta.etag;
	if (meta?.lastModified) headers["if-modified-since"] = meta.lastModified;

	try {
		const response = await fetchImpl(LITELLM_CATALOG_URL, { headers });
		if (response.status === 304 && cachedCatalog) {
			await writeJsonFile(metaPath, { ...meta, fetchedAtMs: nowMs } satisfies CacheMeta);
			return { catalog: cachedCatalog, source: "cache" };
		}
		if (!response.ok) {
			if (cachedCatalog) return { catalog: cachedCatalog, source: "cache" };
			return { catalog: null, source: "none" };
		}

		const json = (await response.json()) as unknown;
		const parsed = parseCatalog(json);
		if (!parsed) {
			if (cachedCatalog) return { catalog: cachedCatalog, source: "cache" };
			return { catalog: null, source: "none" };
		}

		await writeJsonFile(catalogPath, json);
		await writeJsonFile(metaPath, {
			fetchedAtMs: nowMs,
			etag: response.headers.get("etag") ?? undefined,
			lastModified: response.headers.get("last-modified") ?? undefined,
		} satisfies CacheMeta);

		return { catalog: parsed, source: "network" };
	} catch {
		if (cachedCatalog) return { catalog: cachedCatalog, source: "cache" };
		return { catalog: null, source: "none" };
	}
}

function normalizeCandidateKeys(modelId: string): string[] {
	const normalized = modelId.trim();
	if (normalized.length === 0) return [];

	const candidates: string[] = [];
	candidates.push(normalized);
	if (normalized.startsWith("openai/")) candidates.push(normalized.slice("openai/".length));
	if (normalized.startsWith("google/")) candidates.push(normalized.slice("google/".length));
	if (normalized.startsWith("anthropic/")) candidates.push(normalized.slice("anthropic/".length));
	if (normalized.startsWith("xai/")) candidates.push(normalized.slice("xai/".length));
	return candidates;
}

export function resolveLiteLlmPricing(catalog: LiteLlmCatalog, modelId: string): Pricing | null {
	const candidates = normalizeCandidateKeys(modelId);
	for (const key of candidates) {
		const row = catalog[key];
		const input = row?.input_cost_per_token;
		const output = row?.output_cost_per_token;
		if (
			typeof input === "number" &&
			Number.isFinite(input) &&
			input >= 0 &&
			typeof output === "number" &&
			Number.isFinite(output) &&
			output >= 0
		) {
			if (input === 0 && output === 0) continue;
			return { inputUsdPerToken: input, outputUsdPerToken: output };
		}
	}
	return null;
}

function toFinitePositiveInt(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		const int = Math.floor(value);
		return int > 0 ? int : null;
	}
	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			const int = Math.floor(parsed);
			return int > 0 ? int : null;
		}
	}
	return null;
}

export function resolveLiteLlmMaxOutputTokens(
	catalog: LiteLlmCatalog,
	modelId: string,
): number | null {
	const candidates = normalizeCandidateKeys(modelId);
	for (const key of candidates) {
		const row = catalog[key];
		const maxOutput = toFinitePositiveInt(row?.max_output_tokens);
		if (maxOutput) return maxOutput;

		// Fallback: LiteLLM still has legacy `max_tokens` in many rows.
		const maxTokens = toFinitePositiveInt(row?.max_tokens);
		if (maxTokens) return maxTokens;
	}
	return null;
}

export function resolveLiteLlmMaxInputTokens(
	catalog: LiteLlmCatalog,
	modelId: string,
): number | null {
	const candidates = normalizeCandidateKeys(modelId);
	for (const key of candidates) {
		const row = catalog[key];
		const maxInput = toFinitePositiveInt(row?.max_input_tokens);
		if (maxInput) return maxInput;
	}
	return null;
}
