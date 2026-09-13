/** Try the exact ID first, then strip only a catalog-supported provider prefix. */
export function modelIdCandidates(modelId: string, providers: readonly string[]): string[] {
  const trimmed = modelId.trim();
  if (!trimmed) return [];
  const provider = providers.find((name) => trimmed.startsWith(`${name}/`));
  return provider ? [trimmed, trimmed.slice(provider.length + 1)] : [trimmed];
}
