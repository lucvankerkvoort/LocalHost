import type { ItineraryPlan } from './types';
import type { HostMarker } from './trip-session';

const BASE_RADIUS_DEGREES = 0.006;
const RADIUS_STEP_DEGREES = 0.001;
const MAX_RADIUS_STEPS = 6;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildOffset(seed: number): { latOffset: number; lngOffset: number } {
  const angle = (seed % 360) * (Math.PI / 180);
  const step = seed % MAX_RADIUS_STEPS;
  const radius = BASE_RADIUS_DEGREES + step * RADIUS_STEP_DEGREES;
  return {
    latOffset: Math.sin(angle) * radius,
    lngOffset: Math.cos(angle) * radius,
  };
}

export function buildHostMarkersFromPlan(plan: ItineraryPlan): HostMarker[] {
  const hostMap = new Map<string, HostMarker>();

  plan.days.forEach((day) => {
    const anchor = day.anchorLocation?.location;
    const hasValidAnchor =
      anchor &&
      typeof anchor.lat === 'number' &&
      typeof anchor.lng === 'number' &&
      !(anchor.lat === 0 && anchor.lng === 0);

    if (!hasValidAnchor) {
      return;
    }

    day.suggestedHosts?.forEach((host, index) => {
      if (hostMap.has(host.id)) return;

      const seed = hashString(`${host.id}-${day.dayNumber}-${index}`);
      const offset = buildOffset(seed);
      const lat = anchor.lat + offset.latOffset;
      const lng = anchor.lng + offset.lngOffset;

      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

      hostMap.set(host.id, {
        id: host.id,
        hostId: host.id,
        name: host.name,
        photo: host.photoUrl,
        headline: host.headline || host.tags?.[0] || 'Local experience host',
        lat,
        lng,
        category: 'local-host',
        rating: host.rating,
        experienceCount: 1,
      });
    });
  });

  return Array.from(hostMap.values());
}
