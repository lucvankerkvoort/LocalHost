import type { ImageSourceProvider } from '@prisma/client';

export type ImageSafetyFlag = 'SAFE' | 'UNSAFE' | 'UNKNOWN';

export type ImageAttribution = {
  displayName?: string;
  uri?: string;
};

export type ProviderImageQuery = {
  textQuery: string;
  placeId?: string;
  name?: string;
  description?: string;
  city?: string;
  country?: string;
  category?: string;
  width: number;
  height: number;
  count: number;
  languageCode?: string;
  regionCode?: string;
};

export type ProviderImageCandidate = {
  provider: ImageSourceProvider;
  providerImageId: string;
  providerPhotoRef?: string;
  url: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
  title?: string;
  description?: string;
  tags: string[];
  city?: string;
  country?: string;
  attribution: ImageAttribution;
  licenseCode: string;
  photographerName?: string;
  safeFlag: ImageSafetyFlag;
};
