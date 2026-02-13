import { getCityCoordinates } from '@/lib/data/city-coordinates';
import type { HostMarkerData } from '@/types/globe';
import type { PlannerExperience, PlannerExperienceHost } from '@/types/planner-experiences';

export type PlannerExperienceSource = {
  id: string;
  title: string;
  description: string;
  category: string;
  duration: number;
  price: number;
  rating: number | null;
  reviewCount: number | null;
  photos: string[];
  city: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  host: {
    id: string;
    name: string | null;
    image?: string | null;
    bio?: string | null;
    quote?: string | null;
    responseTime?: string | null;
    languages?: string[] | null;
    interests?: string[] | null;
    city?: string | null;
    country?: string | null;
    isHost?: boolean | null;
  };
};

export function normalizeCity(value: string): string {
  return value.trim().toLowerCase();
}

function resolveExperienceCoordinates(experience: PlannerExperienceSource): { lat: number; lng: number } | null {
  const lat = experience.latitude ?? null;
  const lng = experience.longitude ?? null;
  if (typeof lat === 'number' && typeof lng === 'number') {
    if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
      return { lat, lng };
    }
  }

  const fallback = getCityCoordinates(experience.city);
  if (!fallback) return null;
  if (!Number.isFinite(fallback.lat) || !Number.isFinite(fallback.lng)) return null;
  if (fallback.lat === 0 && fallback.lng === 0) return null;
  return fallback;
}

export function derivePlannerHosts(
  city: string,
  experiences: PlannerExperienceSource[]
): PlannerExperienceHost[] {
  const normalizedCity = normalizeCity(city);
  if (!normalizedCity) return [];

  const hostMap = new Map<
    string,
    PlannerExperienceHost & { _ratings: number[] }
  >();

  for (const experience of experiences) {
    if (!experience?.host) continue;
    if (experience.host.isHost === false) continue;
    if (normalizeCity(experience.city) !== normalizedCity) continue;

    const coords = resolveExperienceCoordinates(experience);
    if (!coords) continue;

    const hostId = experience.host.id;
    if (!hostId) continue;

    const hostName = experience.host.name ?? 'Local Host';
    const nextExperience: PlannerExperience = {
      id: experience.id,
      title: experience.title,
      description: experience.description,
      category: experience.category,
      duration: experience.duration,
      price: experience.price,
      rating: typeof experience.rating === 'number' ? experience.rating : 0,
      reviewCount: typeof experience.reviewCount === 'number' ? experience.reviewCount : 0,
      photos: Array.isArray(experience.photos) ? experience.photos : [],
      city: experience.city,
      country: experience.country,
    };

    const existing = hostMap.get(hostId);
    if (existing) {
      existing.experiences.push(nextExperience);
      existing._ratings.push(nextExperience.rating);
      if (!existing.marker) {
        existing.marker = coords;
      }
      continue;
    }

    hostMap.set(hostId, {
      id: hostId,
      name: hostName,
      photo: experience.host.image ?? null,
      bio: experience.host.bio ?? null,
      quote: experience.host.quote ?? null,
      responseTime: experience.host.responseTime ?? null,
      languages: experience.host.languages ?? [],
      interests: experience.host.interests ?? [],
      city: experience.host.city ?? experience.city,
      country: experience.host.country ?? experience.country,
      marker: coords,
      experiences: [nextExperience],
      _ratings: [nextExperience.rating],
    });
  }

  const hosts = Array.from(hostMap.values()).map((host) => {
    host.experiences.sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      return a.price - b.price;
    });
    return host;
  });

  hosts.sort((a, b) => {
    const aAvg = averageRating(a._ratings);
    const bAvg = averageRating(b._ratings);
    if (bAvg !== aAvg) return bAvg - aAvg;
    return a.name.localeCompare(b.name);
  });

  return hosts.map(({ _ratings, ...host }) => host);
}

function averageRating(ratings: number[]): number {
  if (!ratings.length) return 0;
  const sum = ratings.reduce((acc, rating) => acc + rating, 0);
  return sum / ratings.length;
}

export function buildHostMarkersFromPlannerHosts(hosts: PlannerExperienceHost[]): HostMarkerData[] {
  return hosts.map((host) => {
    const avgRating = averageRating(host.experiences.map((exp) => exp.rating));
    return {
      id: host.id,
      hostId: host.id,
      name: host.name,
      lat: host.marker.lat,
      lng: host.marker.lng,
      photo: host.photo ?? undefined,
      headline: host.quote ?? undefined,
      rating: Number.isFinite(avgRating) ? Number(avgRating.toFixed(1)) : undefined,
      experienceCount: host.experiences.length,
    } satisfies HostMarkerData;
  });
}
