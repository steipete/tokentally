import type { TokenUsageNormalized } from "./types.js";

function toFiniteNonNegativeInt(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		const int = Math.floor(value);
		return int >= 0 ? int : null;
	}
	return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Best-effort normalization of token usage across common provider payloads.
 *
 * Accepts `raw` objects containing any of these fields (examples):
 * - `prompt_tokens`, `completion_tokens`
 * - `input_tokens`, `output_tokens`
 * - `inputTokens`, `outputTokens`, `reasoningTokens`
 *
 * Returns `null` if no recognized token fields are found.
 */
export function normalizeTokenUsage(raw: unknown): TokenUsageNormalized | null {
	if (!isRecord(raw)) return null;

	const inputCandidates = [
		raw.inputTokens,
		raw.promptTokens,
		raw.input_tokens,
		raw.prompt_tokens,
		raw.prompt_tokens_total,
	];
	const outputCandidates = [
		raw.outputTokens,
		raw.completionTokens,
		raw.output_tokens,
		raw.completion_tokens,
	];
	const reasoningCandidates = [raw.reasoningTokens, raw.reasoning_tokens];
	const totalCandidates = [raw.totalTokens, raw.total_tokens];

	const inputTokens = inputCandidates.map(toFiniteNonNegativeInt).find((v) => v != null) ?? null;
	const outputTokens = outputCandidates.map(toFiniteNonNegativeInt).find((v) => v != null) ?? null;
	const reasoningTokens =
		reasoningCandidates.map(toFiniteNonNegativeInt).find((v) => v != null) ?? null;
	const totalTokens = totalCandidates.map(toFiniteNonNegativeInt).find((v) => v != null) ?? null;

	if (inputTokens == null && outputTokens == null && reasoningTokens == null && totalTokens == null)
		return null;

	const normalizedInput = inputTokens ?? 0;
	const normalizedOutput = outputTokens ?? 0;
	const normalizedReasoning = reasoningTokens ?? 0;
	const inferredTotal = normalizedInput + normalizedOutput + normalizedReasoning;

	return {
		inputTokens: normalizedInput,
		outputTokens: normalizedOutput,
		...(reasoningTokens != null ? { reasoningTokens: normalizedReasoning } : {}),
		...(totalTokens != null ? { totalTokens } : { totalTokens: inferredTotal }),
	};
}
