import type { TripIntent } from '../intent/types';
import type { AgentStrategy } from './types';
import { regionExplorerStrategy } from './region-explorer';
import { roadTripStrategy } from './road-trip';
import { multiCountryStrategy } from './multi-country';
import { defaultStrategy } from './default';

/**
 * Map resolved trip intent to a strategy.
 * Spatial pattern takes absolute priority over mobility mode.
 * Mobility mode is only a fallback when spatial pattern is UNKNOWN,
 * so "driving a multi-city loop" (MULTI_DESTINATION + OWN_CAR) correctly
 * routes to multi-country rather than road-trip.
 */
export function routeToStrategy(intent: TripIntent): AgentStrategy {
  const { spatialPattern, mobilityMode } = intent;

  // Spatial pattern wins unconditionally
  if (spatialPattern === 'BASE_EXPLORE' || spatialPattern === 'HUB_SPOKE')
    return regionExplorerStrategy;
  if (spatialPattern === 'LINEAR_ROUTE')
    return roadTripStrategy;
  if (spatialPattern === 'MULTI_DESTINATION')
    return multiCountryStrategy;

  // spatialPattern === 'UNKNOWN' — fall back to mobility clues
  if (mobilityMode === 'OWN_CAR' || mobilityMode === 'RV')
    return roadTripStrategy;
  if (mobilityMode === 'FLIGHTS_ONLY')
    return multiCountryStrategy;

  // NO_CAR, MIXED, and UNKNOWN mobility: no spatial signal to act on.
  // defaultStrategy leaves systemPromptSection empty so the discovery prompt
  // fires and asks the user one clarifying question before routing.
  return defaultStrategy;
}
