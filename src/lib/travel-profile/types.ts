export type TravelStyle =
  | 'ROAD_TRIP'
  | 'REGION_EXPLORER'
  | 'MULTI_COUNTRY'
  | 'BACKPACKER'
  | 'LUXURY'
  | 'CULTURAL'
  | 'ADVENTURE'
  | 'FLEXIBLE';

export type TravelPace = 'RELAXED' | 'BALANCED' | 'PACKED';
export type TravelBudget = 'BUDGET' | 'MID' | 'PREMIUM';
export type TravelGroup = 'SOLO' | 'COUPLE' | 'FAMILY' | 'GROUP';

export interface TravelProfile {
  id: string;
  userId: string;
  travelStyle: TravelStyle;
  pace: TravelPace;
  budget: TravelBudget;
  groupType: TravelGroup;
  transportPreference: string | null;
  interests: string[];
  completedAt: Date | null;
}

export interface TravelProfileInput {
  travelStyle?: TravelStyle;
  pace?: TravelPace;
  budget?: TravelBudget;
  groupType?: TravelGroup;
  transportPreference?: string | null;
  interests?: string[];
  completedAt?: Date | null;
}

// Human-readable labels used in system prompts
export const TRAVEL_STYLE_LABELS: Record<TravelStyle, string> = {
  ROAD_TRIP: 'Road Tripper',
  REGION_EXPLORER: 'Region Explorer',
  MULTI_COUNTRY: 'Multi-Country Traveler',
  BACKPACKER: 'Backpacker',
  LUXURY: 'Luxury Traveler',
  CULTURAL: 'Culture Seeker',
  ADVENTURE: 'Adventure Traveler',
  FLEXIBLE: 'Flexible',
};

export const TRAVEL_GROUP_LABELS: Record<TravelGroup, string> = {
  SOLO: 'solo',
  COUPLE: 'couple',
  FAMILY: 'family',
  GROUP: 'group',
};

// Maps each travel style to sensible planner defaults
export const STYLE_TRANSPORT_DEFAULTS: Partial<Record<TravelStyle, string>> = {
  ROAD_TRIP: 'drive',
  MULTI_COUNTRY: 'flight',
  BACKPACKER: 'mixed',
};
