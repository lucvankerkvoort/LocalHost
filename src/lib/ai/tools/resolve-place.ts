import { z } from 'zod';
import { createTool, ToolResult } from './tool-registry';

// ============================================================================
// Schema
// ============================================================================

const ResolvePlaceParams = z.object({
  name: z.string().describe('Name of the place to geocode'),
  context: z.string().optional().describe('City, country, or area hint for disambiguation'),
  anchorPoint: z.object({
    lat: z.number(),
    lng: z.number(),
  }).optional().describe('Reference point (e.g. city center) to prefer closer results'),
});

type ResolvePlaceResult = {
  id: string;
  name: string;
  formattedAddress: string;
  location: {
    lat: number;
    lng: number;
  };
  category: 'landmark' | 'museum' | 'restaurant' | 'park' | 'neighborhood' | 'city' | 'country' | 'other';
  confidence: number;
  distanceToAnchor?: number;
  city?: string;
};

// ============================================================================
// Nominatim Response Types
// ============================================================================

interface NominatimResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  class: string;
  type: string;
  place_rank: number;
  importance: number;
  addresstype: string;
  name: string;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

// ============================================================================
// Cache
// ============================================================================

const GEOCODE_CACHE = new Map<string, ResolvePlaceResult[]>();

// ============================================================================
// Helpers
// ============================================================================

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function buildQueryVariants(name: string, context?: string): string[] {
  const variants: string[] = [];
  
  // Prioritize "Name, City" as it's the sweet spot for speed/accuracy with triangulation
  if (context) {
    const parts = context.split(',').map(p => p.trim()).filter(Boolean);
    // 1. Name, City (Fastest, usually correct with triangulation)
    variants.push(`${name}, ${parts[0]}`);
    // 2. Name, City, Country (More specific if first fails)
    variants.push(`${name}, ${context}`);
  } else {
    variants.push(name);
  }
  
  return Array.from(new Set(variants));
}

async function fetchNominatimResults(
  baseUrl: string,
  searchQuery: string,
): Promise<NominatimResult[]> {
  const url = new URL(baseUrl);
  url.searchParams.set('q', searchQuery);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '5'); // Fetch 5 candidates for triangulation
  url.searchParams.set('addressdetails', '1');

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'LocalhostTravelApp/1.0 (https://localhost.dev; contact@localhost.dev)',
    },
  });

  if (!response.ok) {
    throw new Error(`Geocoding API error: ${response.status}`);
  }

  return await response.json();
}

function mapNominatimCategory(osmClass: string, osmType: string): ResolvePlaceResult['category'] {
  if (osmClass === 'tourism') {
    if (['museum', 'gallery'].includes(osmType)) return 'museum';
    if (['attraction', 'viewpoint', 'monument'].includes(osmType)) return 'landmark';
    return 'landmark';
  }
  if (osmClass === 'leisure' && ['park', 'garden', 'nature_reserve'].includes(osmType)) return 'park';
  if (osmClass === 'amenity' && ['restaurant', 'cafe', 'bar', 'fast_food'].includes(osmType)) return 'restaurant';
  if (osmClass === 'place') {
    if (['city', 'town', 'village'].includes(osmType)) return 'city';
    if (osmType === 'country') return 'country';
    if (['neighbourhood', 'suburb', 'quarter'].includes(osmType)) return 'neighborhood';
  }
  if (osmClass === 'boundary' && osmType === 'administrative') return 'city';
  return 'other';
}

function extractCityFromAddress(address?: NominatimResult['address']): string | undefined {
  if (!address) return undefined;
  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    address.state
  );
}

function attachDistanceToAnchor(
  result: ResolvePlaceResult,
  anchorPoint?: { lat: number; lng: number }
): ResolvePlaceResult {
  if (!anchorPoint) return result;
  return {
    ...result,
    distanceToAnchor: calculateDistance(
      result.location.lat,
      result.location.lng,
      anchorPoint.lat,
      anchorPoint.lng
    ),
  };
}

function formatPlaceResult(result: NominatimResult, fallbackName: string): ResolvePlaceResult {
  const category = mapNominatimCategory(result.class, result.type);
  const confidence = Math.min(result.importance + 0.3, 1);
  const city = extractCityFromAddress(result.address);

  return {
    id: `osm-${result.osm_type}-${result.osm_id}`,
    name: result.name || fallbackName,
    formattedAddress: result.display_name,
    city,
    location: {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
    },
    category,
    confidence,
  };
}

// ============================================================================
// Tool Implementation
// ============================================================================

export const resolvePlaceTool = createTool({
  name: 'resolve_place',
  description: 'Convert a place name to geographic coordinates using OpenStreetMap geocoding with triangulation.',
  parameters: ResolvePlaceParams,

  async handler(params): Promise<ToolResult<ResolvePlaceResult>> {
    try {
      const queryVariants = buildQueryVariants(params.name, params.context);
      const primaryEndpoint = 'https://nominatim.openstreetmap.org/search';
      
      // Check cache first
      const cacheKey = `${params.name}|${params.context || ''}`;
      if (GEOCODE_CACHE.has(cacheKey)) {
        const cachedResults = GEOCODE_CACHE.get(cacheKey)!;
        if (cachedResults.length > 0) {
          // Re-sort cached results if anchor point changed (unlikely but possible)
          if (params.anchorPoint) {
            const best = cachedResults.reduce((prev, curr) => {
              const prevDist = calculateDistance(
                prev.location.lat,
                prev.location.lng,
                params.anchorPoint!.lat,
                params.anchorPoint!.lng
              );
              const currDist = calculateDistance(
                curr.location.lat,
                curr.location.lng,
                params.anchorPoint!.lat,
                params.anchorPoint!.lng
              );
              return prevDist < currDist ? prev : curr;
            });
            console.log(`[resolve_place] Cache hit for "${params.name}"`);
            return { success: true, data: attachDistanceToAnchor(best, params.anchorPoint) };
          }
          return { success: true, data: cachedResults[0] };
        }
      }

      for (const searchQuery of queryVariants) {
        try {
          // 1. Fetch candidates (limit=5)
          const results = await fetchNominatimResults(primaryEndpoint, searchQuery);
          
          if (results.length > 0) {
            // 2. Format all candidates
            const formattedResults = results.map(r => formatPlaceResult(r, params.name));
            
            // 3. Cache them
            GEOCODE_CACHE.set(cacheKey, formattedResults);
            
            // 4. Triangulate: Find closest to anchor
            let bestResult = formattedResults[0];
            
            if (params.anchorPoint) {
              let minDistance = Number.MAX_VALUE;
              
              for (const res of formattedResults) {
                const dist = calculateDistance(
                  res.location.lat, res.location.lng,
                  params.anchorPoint.lat, params.anchorPoint.lng
                );
                
                // If within reasonable range (e.g. < 50km from city center) prefer it
                if (dist < minDistance) {
                  minDistance = dist;
                  bestResult = { ...res, distanceToAnchor: dist };
                }
              }
              console.log(`[resolve_place] Triangulated best match for "${params.name}": ${bestResult.name} (${Math.round(minDistance)}m away)`);
            } else {
               console.log(`[resolve_place] Found "${params.name}" (no anchor provided)`);
            }

            return { success: true, data: attachDistanceToAnchor(bestResult, params.anchorPoint) };
          }
        } catch (error) {
          console.warn(`[resolve_place] Error for "${searchQuery}":`, error);
        }

        // Small delay between variants to respect rate limits (1 req/sec)
        // If the first query failed to find results, we must wait > 1s before trying the next
        await new Promise(resolve => setTimeout(resolve, 1200));
      }

      console.warn(`[resolve_place] No results for: ${params.name}`);
      return {
        success: false,
        error: `No location found for: ${params.name}`,
        code: 'NO_RESULTS',
      };
      
    } catch (error) {
      console.error(`[resolve_place] Error:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Geocoding failed',
        code: 'GEOCODE_ERROR',
      };
    }
  },
});
