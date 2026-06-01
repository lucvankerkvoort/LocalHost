export type SpatialPattern =
  | 'BASE_EXPLORE'      // single base, explore outward (Airbnb in Wari, discover the region)
  | 'LINEAR_ROUTE'      // point-to-point drive (LA → SF along Highway 1)
  | 'HUB_SPOKE'         // base city with day trips radiating out
  | 'MULTI_DESTINATION' // hop between multiple cities / countries
  | 'UNKNOWN';

export type ActivityFocus =
  | 'CULTURE'
  | 'FOOD'
  | 'NATURE'
  | 'ADVENTURE'
  | 'UNKNOWN';

export type MobilityMode =
  | 'OWN_CAR'
  | 'RV'
  | 'NO_CAR'
  | 'FLIGHTS_ONLY'
  | 'MIXED'
  | 'UNKNOWN';

export interface TripIntent {
  spatialPattern: SpatialPattern;
  activityFocus: ActivityFocus;
  mobilityMode: MobilityMode;
  pace?: 'relaxed' | 'balanced' | 'packed';
  /** Dimensions not yet resolved from messages or profile. */
  unresolvedDimensions: Array<'spatialPattern' | 'activityFocus' | 'mobilityMode' | 'pace'>;
}
