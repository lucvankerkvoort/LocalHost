import type { HostCreationStop } from '@/store/host-creation-slice';

export type StopNameResolution =
  | { ok: true; stopId: string }
  | { ok: false; reason: 'UNMATCHED' | 'AMBIGUOUS'; targetName: string };

export type StopMutationResult =
  | { success: true; stops: HostCreationStop[] }
  | {
      success: false;
      reason: 'UNMATCHED' | 'AMBIGUOUS' | 'NO_CHANGES_REQUESTED';
      targetName?: string;
      unmatchedNames?: string[];
      ambiguousNames?: string[];
    };

function withSequentialOrder(stops: HostCreationStop[]): HostCreationStop[] {
  return stops.map((stop, index) => ({ ...stop, order: index + 1 }));
}

export function normalizeStopName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[`"'.,;:!?()[\]{}-]+|[`"'.,;:!?()[\]{}-]+$/g, '');
}

export function resolveStopByName(
  stops: HostCreationStop[],
  targetName: string
): StopNameResolution {
  const normalizedTarget = normalizeStopName(targetName);
  const matches = stops.filter(
    (stop) => normalizeStopName(stop.name) === normalizedTarget
  );

  if (matches.length === 0) {
    return { ok: false, reason: 'UNMATCHED', targetName };
  }
  if (matches.length > 1) {
    return { ok: false, reason: 'AMBIGUOUS', targetName };
  }

  return { ok: true, stopId: matches[0].id };
}

export function applyStopUpdateByName(
  stops: HostCreationStop[],
  payload: { targetName: string; newName?: string; description?: string }
): StopMutationResult {
  const hasNameChange =
    typeof payload.newName === 'string' && payload.newName.trim().length > 0;
  const hasDescriptionChange = typeof payload.description === 'string';
  if (!hasNameChange && !hasDescriptionChange) {
    return { success: false, reason: 'NO_CHANGES_REQUESTED' };
  }

  const resolved = resolveStopByName(stops, payload.targetName);
  if (!resolved.ok) {
    return {
      success: false,
      reason: resolved.reason,
      targetName: resolved.targetName,
    };
  }

  const nextStops = stops.map((stop) => {
    if (stop.id !== resolved.stopId) return stop;
    return {
      ...stop,
      ...(hasNameChange ? { name: payload.newName!.trim() } : {}),
      ...(hasDescriptionChange ? { description: payload.description } : {}),
    };
  });

  return { success: true, stops: withSequentialOrder(nextStops) };
}

export function applyStopRemovalByName(
  stops: HostCreationStop[],
  targetName: string
): StopMutationResult {
  const resolved = resolveStopByName(stops, targetName);
  if (!resolved.ok) {
    return {
      success: false,
      reason: resolved.reason,
      targetName: resolved.targetName,
    };
  }

  return {
    success: true,
    stops: withSequentialOrder(stops.filter((stop) => stop.id !== resolved.stopId)),
  };
}

export function applyStopReorderByNames(
  stops: HostCreationStop[],
  orderedNames: string[]
): StopMutationResult {
  const normalizedRequested = orderedNames.map((name) => normalizeStopName(name));
  const seenRequested = new Set<string>();
  const duplicateRequested = new Set<string>();
  for (const normalized of normalizedRequested) {
    if (seenRequested.has(normalized)) {
      duplicateRequested.add(normalized);
    }
    seenRequested.add(normalized);
  }

  const ambiguousNames = new Set<string>();
  const unmatchedNames = new Set<string>();
  const pickedIds = new Set<string>();
  const pickedStops: HostCreationStop[] = [];

  for (let index = 0; index < orderedNames.length; index += 1) {
    const originalName = orderedNames[index];
    const normalizedName = normalizedRequested[index];

    if (duplicateRequested.has(normalizedName)) {
      ambiguousNames.add(originalName);
      continue;
    }

    const availableMatches = stops.filter(
      (stop) =>
        normalizeStopName(stop.name) === normalizedName && !pickedIds.has(stop.id)
    );

    if (availableMatches.length === 0) {
      unmatchedNames.add(originalName);
      continue;
    }
    if (availableMatches.length > 1) {
      ambiguousNames.add(originalName);
      continue;
    }

    pickedStops.push(availableMatches[0]);
    pickedIds.add(availableMatches[0].id);
  }

  if (unmatchedNames.size > 0 || ambiguousNames.size > 0) {
    return {
      success: false,
      reason: ambiguousNames.size > 0 ? 'AMBIGUOUS' : 'UNMATCHED',
      unmatchedNames: [...unmatchedNames],
      ambiguousNames: [...ambiguousNames],
    };
  }

  const remainingStops = stops.filter((stop) => !pickedIds.has(stop.id));
  return {
    success: true,
    stops: withSequentialOrder([...pickedStops, ...remainingStops]),
  };
}

export function applyStopAppend(
  stops: HostCreationStop[],
  payload: { name: string; lat: number; lng: number; description?: string }
): HostCreationStop[] {
  return withSequentialOrder([
    ...stops,
    {
      id: crypto.randomUUID(),
      name: payload.name,
      lat: payload.lat,
      lng: payload.lng,
      description: payload.description,
      order: stops.length + 1,
    },
  ]);
}
