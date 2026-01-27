import { z } from 'zod';
import { createTool, ToolResult } from './tool-registry';

// ============================================================================
// Schema
// ============================================================================

const WaypointSchema = z.object({
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
});

const GenerateRouteParams = z.object({
  waypoints: z.array(WaypointSchema).min(2).describe('Ordered list of locations to visit'),
  mode: z.enum(['walk', 'transit', 'drive']).default('walk').describe('Transportation mode'),
  optimizeOrder: z.boolean().default(false).describe('Whether to reorder waypoints for optimal route'),
});

type RouteSegment = {
  from: { name: string; lat: number; lng: number };
  to: { name: string; lat: number; lng: number };
  mode: 'walk' | 'transit' | 'drive';
  distanceMeters: number;
  durationMinutes: number;
  instructions: string;
};

type GenerateRouteResult = {
  totalDistanceMeters: number;
  totalDurationMinutes: number;
  segments: RouteSegment[];
  waypoints: Array<{ name: string; lat: number; lng: number }>;
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate distance between two points using Haversine formula
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Estimate duration based on distance and mode
 */
function estimateDuration(distanceMeters: number, mode: 'walk' | 'transit' | 'drive'): number {
  const speeds: Record<typeof mode, number> = {
    walk: 80,      // 80 meters per minute (~5 km/h)
    transit: 500,  // 500 meters per minute (~30 km/h average with stops)
    drive: 700,    // 700 meters per minute (~42 km/h city driving)
  };
  return Math.ceil(distanceMeters / speeds[mode]);
}

/**
 * Generate navigation instructions based on mode and distance
 */
function generateInstructions(from: string, to: string, distanceMeters: number, mode: 'walk' | 'transit' | 'drive'): string {
  const distanceKm = (distanceMeters / 1000).toFixed(1);
  
  switch (mode) {
    case 'walk':
      if (distanceMeters < 500) return `Short walk to ${to} (${Math.round(distanceMeters)}m)`;
      return `Walk ${distanceKm}km to ${to}`;
    case 'transit':
      if (distanceMeters < 1000) return `Take bus or tram to ${to}`;
      return `Take metro/train to ${to} (${distanceKm}km)`;
    case 'drive':
      return `Drive ${distanceKm}km to ${to}`;
  }
}

// ============================================================================
// Tool Implementation
// ============================================================================

export const generateRouteTool = createTool({
  name: 'generate_route',
  description: 'Create navigation route between multiple locations. Returns distance, duration, and turn-by-turn segments.',
  parameters: GenerateRouteParams,

  async handler(params): Promise<ToolResult<GenerateRouteResult>> {
    try {
      let waypoints = [...params.waypoints];

      // Simple optimization: nearest neighbor algorithm
      if (params.optimizeOrder && waypoints.length > 2) {
        const optimized = [waypoints[0]];
        const remaining = waypoints.slice(1);
        
        while (remaining.length > 0) {
          const last = optimized[optimized.length - 1];
          let nearestIdx = 0;
          let nearestDist = Infinity;
          
          for (let i = 0; i < remaining.length; i++) {
            const dist = haversineDistance(last.lat, last.lng, remaining[i].lat, remaining[i].lng);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestIdx = i;
            }
          }
          
          optimized.push(remaining[nearestIdx]);
          remaining.splice(nearestIdx, 1);
        }
        
        waypoints = optimized;
      }

      // Generate segments between consecutive waypoints
      const segments: RouteSegment[] = [];
      let totalDistance = 0;
      let totalDuration = 0;

      for (let i = 0; i < waypoints.length - 1; i++) {
        const from = waypoints[i];
        const to = waypoints[i + 1];
        
        const distance = haversineDistance(from.lat, from.lng, to.lat, to.lng);
        // Auto-select mode based on distance if walking would take too long
        let mode = params.mode;
        if (mode === 'walk' && distance > 2000) {
          mode = 'transit';
        }
        
        const duration = estimateDuration(distance, mode);
        
        segments.push({
          from: { name: from.name, lat: from.lat, lng: from.lng },
          to: { name: to.name, lat: to.lat, lng: to.lng },
          mode,
          distanceMeters: Math.round(distance),
          durationMinutes: duration,
          instructions: generateInstructions(from.name, to.name, distance, mode),
        });
        
        totalDistance += distance;
        totalDuration += duration;
      }

      return {
        success: true,
        data: {
          totalDistanceMeters: Math.round(totalDistance),
          totalDurationMinutes: totalDuration,
          segments,
          waypoints,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Route generation failed',
        code: 'ROUTE_ERROR',
      };
    }
  },
});
