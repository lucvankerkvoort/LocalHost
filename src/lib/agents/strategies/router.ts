import type { TripIntent } from '../intent/types';
import type { AgentStrategy } from './types';
import { regionExplorerStrategy } from './region-explorer';
import { roadTripStrategy } from './road-trip';
import { multiCountryStrategy } from './multi-country';
import { defaultStrategy } from './default';

/**
 * Map resolved trip intent to a strategy.
 * Spatial pattern takes priority; mobility mode is a fallback signal.
 */
export function routeToStrategy(intent: TripIntent): AgentStrategy {
  const { spatialPattern, mobilityMode } = intent;

  if (spatialPattern === 'BASE_EXPLORE' || spatialPattern === 'HUB_SPOKE')
    return regionExplorerStrategy;

  if (
    spatialPattern === 'LINEAR_ROUTE' ||
    mobilityMode === 'OWN_CAR' ||
    mobilityMode === 'RV'
  )
    return roadTripStrategy;

  if (spatialPattern === 'MULTI_DESTINATION' || mobilityMode === 'FLIGHTS_ONLY')
    return multiCountryStrategy;

  return defaultStrategy;
}
