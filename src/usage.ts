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

function fieldFromRecord(value: unknown, field: string): unknown {
  return isRecord(value) ? value[field] : undefined;
}

function firstTokenCount(values: unknown[]): number | null {
  return values.map(toFiniteNonNegativeInt).find((v) => v != null) ?? null;
}

/**
 * Best-effort normalization of token usage across common provider payloads.
 *
 * Accepts `raw` objects containing any of these fields (examples):
 * - `prompt_tokens`, `completion_tokens`
 * - `input_tokens`, `output_tokens`
 * - `inputTokens`, `outputTokens`, `reasoningTokens`
 * - nested details such as `completion_tokens_details.reasoning_tokens`
 *   and `prompt_tokens_details.cached_tokens`
 *
 * Returns `null` if no recognized token fields are found.
 */
export function normalizeTokenUsage(raw: unknown): TokenUsageNormalized | null {
  if (!isRecord(raw)) return null;

  const inputDetails = raw.input_tokens_details ?? raw.prompt_tokens_details;
  const outputDetails = raw.output_tokens_details ?? raw.completion_tokens_details;

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
  // Anthropic reports both cache fields at the top level, and `input_tokens`
  // excludes them, so they are additive rather than a subset of the input count.
  const anthropicCacheRead = firstTokenCount([raw.cache_read_input_tokens]);
  const anthropicCacheCreation = firstTokenCount([raw.cache_creation_input_tokens]);
  const cachedInputCandidates = [
    raw.cachedInputTokens,
    raw.cached_input_tokens,
    anthropicCacheRead,
    fieldFromRecord(inputDetails, "cached_tokens"),
    fieldFromRecord(inputDetails, "cache_read_input_tokens"),
  ];
  const reasoningCandidates = [raw.reasoningTokens, raw.reasoning_tokens];
  const nestedReasoningCandidates = [fieldFromRecord(outputDetails, "reasoning_tokens")];
  const totalCandidates = [raw.totalTokens, raw.total_tokens];

  const inputTokens = firstTokenCount(inputCandidates);
  const outputTokens = firstTokenCount(outputCandidates);
  const cachedInputTokens = firstTokenCount(cachedInputCandidates);
  const topLevelReasoningTokens = firstTokenCount(reasoningCandidates);
  const nestedReasoningTokens = firstTokenCount(nestedReasoningCandidates);
  const reasoningTokens = topLevelReasoningTokens ?? nestedReasoningTokens;
  const totalTokens = firstTokenCount(totalCandidates);

  if (
    inputTokens == null &&
    outputTokens == null &&
    cachedInputTokens == null &&
    anthropicCacheCreation == null &&
    reasoningTokens == null &&
    totalTokens == null
  )
    return null;

  const normalizedInput = inputTokens ?? 0;
  const normalizedOutput = outputTokens ?? 0;
  const normalizedReasoning = reasoningTokens ?? 0;
  const inferredTotal =
    normalizedInput +
    normalizedOutput +
    (anthropicCacheRead ?? 0) +
    (anthropicCacheCreation ?? 0) +
    (topLevelReasoningTokens != null ? normalizedReasoning : 0);

  return {
    inputTokens: normalizedInput,
    outputTokens: normalizedOutput,
    ...(cachedInputTokens != null ? { cachedInputTokens } : {}),
    ...(reasoningTokens != null ? { reasoningTokens: normalizedReasoning } : {}),
    ...(totalTokens != null ? { totalTokens } : { totalTokens: inferredTotal }),
  };
}
