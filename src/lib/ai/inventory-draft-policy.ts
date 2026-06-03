/**
 * Utility for extracting trip duration from a natural-language prompt.
 * Used by the orchestrator to key the L2 plan pool cache.
 */
export function extractRequestedDurationDays(prompt: string): number | null {
  const lower = prompt.toLowerCase();
  const match = lower.match(/\b(\d{1,3})\s*[- ]?day(s)?\b/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1] ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}
