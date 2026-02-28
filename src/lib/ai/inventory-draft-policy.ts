export type DraftInventoryScope = 'single_city' | 'multi_city' | 'region_or_country' | 'unknown';

export function extractRequestedDurationDays(prompt: string): number | null {
  const lower = prompt.toLowerCase();
  const match = lower.match(/\b(\d{1,3})\s*[- ]?day(s)?\b/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1] ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function minimumInventoryCountForStrictDraft(durationDays: number | null): number {
  if (!durationDays) {
    return 10;
  }
  // Require meaningfully more POIs than days to reduce repetition in strict inventory mode.
  return Math.max(10, Math.min(40, Math.ceil(durationDays * 1.5)));
}

export function shouldEnforceStrictInventoryDraft(params: {
  scope: DraftInventoryScope;
  inventoryCount: number;
  durationDays: number | null;
}): boolean {
  const { scope, inventoryCount, durationDays } = params;
  if (scope !== 'single_city') return false;
  return inventoryCount >= minimumInventoryCountForStrictDraft(durationDays);
}

