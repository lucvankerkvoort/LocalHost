import type { PlaceMarkerData } from '@/types/globe';
import type { PlannerExperienceHost } from '@/types/planner-experiences';

export function buildPlannerExperienceStopMarkers(
  hosts: PlannerExperienceHost[],
  selectedHostId?: string | null,
  selectedExperienceId?: string | null
): PlaceMarkerData[] {
  if (!selectedHostId) return [];

  const selectedHost = hosts.find((host) => host.id === selectedHostId);
  if (!selectedHost) return [];

  const scopedExperiences = selectedExperienceId
    ? selectedHost.experiences.filter((experience) => experience.id === selectedExperienceId)
    : selectedHost.experiences;

  if (scopedExperiences.length === 0) return [];

  const includeExperiencePrefix = scopedExperiences.length > 1;
  const markers: PlaceMarkerData[] = [];

  for (const experience of scopedExperiences) {
    const stops = Array.isArray(experience.stops) ? experience.stops : [];
    for (const stop of stops) {
      if (typeof stop.lat !== 'number' || typeof stop.lng !== 'number') continue;
      if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) continue;

      markers.push({
        id: `planner-stop-${experience.id}-${stop.id}`,
        name: includeExperiencePrefix ? `${experience.title} - ${stop.name}` : stop.name,
        lat: stop.lat,
        lng: stop.lng,
        category: 'experience',
      });
    }
  }

  return markers;
}
