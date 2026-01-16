// App-wide constants and configuration

export const APP_NAME = 'Localhost';
export const APP_TAGLINE = 'Authentic local experiences, one connection at a time';
export const APP_DESCRIPTION = 
  'Localhost connects travelers with authentic, small-scale local experiences hosted by verified community members.';

// Feature flags
export const FEATURES = {
  enableDarkMode: true,
  enableNotifications: true,
  enableMessaging: true,
  enableReviews: true,
} as const;

// Limits
export const LIMITS = {
  minPhotosPerExperience: 3,
  maxPhotosPerExperience: 10,
  maxDescriptionLength: 2000,
  maxBioLength: 500,
  maxGroupSize: 20,
  minGroupSize: 1,
  maxPriceUSD: 100000, // in cents = $1000
} as const;

// Navigation
export const NAV_ITEMS = [
  { label: 'Explore', href: '/explore' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Become a Host', href: '/host' },
] as const;

// Social links
export const SOCIAL_LINKS = {
  twitter: 'https://twitter.com/localhost',
  instagram: 'https://instagram.com/localhost',
  facebook: 'https://facebook.com/localhost',
} as const;

// Default values
export const DEFAULTS = {
  currency: 'USD',
  language: 'en',
  pageSize: 12,
  mapZoom: 13,
} as const;

// Trust tiers
export const TRUST_TIERS = {
  basic: {
    label: 'Basic',
    description: 'Email and profile photo verified',
    minScore: 0,
  },
  verified: {
    label: 'Verified',
    description: 'ID and phone verified',
    minScore: 50,
  },
  trusted: {
    label: 'Trusted',
    description: 'Background check + 10+ positive reviews',
    minScore: 80,
  },
} as const;
