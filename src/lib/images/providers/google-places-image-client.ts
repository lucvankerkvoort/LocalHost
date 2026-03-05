import {
  googlePlacesPhotoMedia,
  googlePlacesSearchText,
  resolveGooglePlacesApiKey,
} from '@/lib/providers/google-places-client';

import type { ProviderImageCandidate, ProviderImageQuery } from './types';

type GooglePhoto = {
  name?: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: Array<{
    displayName?: string;
    uri?: string;
  }>;
};

type GooglePlace = {
  displayName?: { text?: string };
  formattedAddress?: string;
  photos?: GooglePhoto[];
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
};

type GooglePlacesSearchResponse = {
  places?: GooglePlace[];
};

type GooglePhotoMediaResponse = {
  photoUri?: string;
};

function normalizeText(value?: string | null): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function extractCity(components?: GooglePlace['addressComponents']): string | undefined {
  if (!components) return undefined;
  const locality = components.find((component) => component.types?.includes('locality'));
  return locality?.longText ?? locality?.shortText;
}

function extractCountry(components?: GooglePlace['addressComponents']): string | undefined {
  if (!components) return undefined;
  const country = components.find((component) => component.types?.includes('country'));
  return country?.longText ?? country?.shortText;
}

export function resolveGooglePlacesImageApiKey(): string | null {
  return resolveGooglePlacesApiKey();
}

export async function searchGooglePlacesImageCandidates(
  query: ProviderImageQuery,
  apiKey: string
): Promise<ProviderImageCandidate[]> {
  const response = await googlePlacesSearchText({
    apiKey,
    fieldMask:
      'places.displayName,places.formattedAddress,places.photos,places.addressComponents',
    body: {
      textQuery: query.textQuery,
      pageSize: 1,
      ...(query.languageCode ? { languageCode: query.languageCode } : null),
      ...(query.regionCode ? { regionCode: query.regionCode } : null),
    },
    timeoutMs: 8000,
    retries: 1,
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as GooglePlacesSearchResponse;
  const place = payload.places?.[0];
  if (!place) return [];

  const photos = (place.photos ?? []).slice(0, Math.max(6, query.count * 2));
  if (photos.length === 0) return [];

  const city = extractCity(place.addressComponents) ?? query.city;
  const country = extractCountry(place.addressComponents) ?? query.country;

  const candidates = await Promise.all(
    photos.map(async (photo): Promise<ProviderImageCandidate | null> => {
      if (!photo.name) return null;

      const mediaResponse = await googlePlacesPhotoMedia({
        apiKey,
        photoName: photo.name,
        width: query.width,
        height: query.height,
        timeoutMs: 8000,
        retries: 1,
      });

      if (!mediaResponse.ok) return null;

      const mediaPayload = (await mediaResponse.json()) as GooglePhotoMediaResponse;
      if (!mediaPayload.photoUri) return null;

      const attribution = photo.authorAttributions?.[0];
      const title = place.displayName?.text;

      return {
        provider: 'GOOGLE_PLACES',
        providerImageId: photo.name,
        providerPhotoRef: photo.name,
        url: mediaPayload.photoUri,
        width: typeof photo.widthPx === 'number' ? photo.widthPx : query.width,
        height: typeof photo.heightPx === 'number' ? photo.heightPx : query.height,
        title,
        description: place.formattedAddress,
        tags: Array.from(
          new Set([
            ...normalizeText(title),
            ...normalizeText(place.formattedAddress),
            ...normalizeText(query.category),
          ])
        ),
        city,
        country,
        attribution: {
          displayName: attribution?.displayName,
          uri: attribution?.uri,
        },
        licenseCode: 'GOOGLE_ATTRIBUTION_REQUIRED',
        photographerName: attribution?.displayName,
        safeFlag: 'UNKNOWN',
      };
    })
  );

  return candidates.filter((candidate): candidate is ProviderImageCandidate => Boolean(candidate));
}
