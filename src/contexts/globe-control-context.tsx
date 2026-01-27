'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { ItineraryPlan } from '@/lib/ai/types';

// ============================================================================
// Types
// ============================================================================

export interface HostMarkerData {
  id: string;
  hostId?: string;
  name: string;
  lat: number;
  lng: number;
  photo?: string;
  headline?: string;
  rating?: number;
  experienceCount?: number;
}

export interface GlobeDestination {
  id: string;
  name: string;
  lat: number;
  lng: number;
  day: number;
  color: string;
  activities: any[];
}

export interface TravelRoute {
  id: string;
  fromId: string;
  toId: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  mode: 'flight' | 'train' | 'drive' | 'walk';
}

interface GlobeControlState {
  // Camera target
  visualTarget: { lat: number; lng: number; height?: number } | null;
  
  // Itinerary data
  destinations: GlobeDestination[];
  routes: TravelRoute[];
  selectedDestination: string | null;
  
  // Host markers
  hostMarkers: HostMarkerData[];
}

interface GlobeControlActions {
  // Camera control
  flyTo: (lat: number, lng: number, height?: number, label?: string) => void;
  
  // Itinerary control  
  setItinerary: (plan: ItineraryPlan) => void;
  clearItinerary: () => void;
  selectDestination: (id: string | null) => void;
  
  // Host markers
  setHostMarkers: (hosts: HostMarkerData[]) => void;
  addHostMarkers: (hosts: HostMarkerData[]) => void;
  clearHostMarkers: () => void;
}

type GlobeControlContextType = GlobeControlState & GlobeControlActions;

// ============================================================================
// Context
// ============================================================================

const GlobeControlContext = createContext<GlobeControlContextType | null>(null);

// ============================================================================
// Helpers
// ============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const DAY_COLORS = [
  '#e85d04', // orange
  '#2a9d8f', // teal
  '#e9c46a', // yellow
  '#264653', // dark blue
  '#f4a261', // peach
  '#00b4d8', // sky blue
  '#9b5de5', // purple
];

function getColorForDay(day: number): string {
  return DAY_COLORS[(day - 1) % DAY_COLORS.length];
}

// ============================================================================
// Provider
// ============================================================================

export function GlobeControlProvider({ children }: { children: ReactNode }) {
  // State
  const [visualTarget, setVisualTarget] = useState<GlobeControlState['visualTarget']>(null);
  const [destinations, setDestinations] = useState<GlobeDestination[]>([]);
  const [routes, setRoutes] = useState<TravelRoute[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);
  const [hostMarkers, setHostMarkersState] = useState<HostMarkerData[]>([]);

  // Actions
  const flyTo = useCallback((lat: number, lng: number, height?: number, label?: string) => {
    console.log(`[GlobeControl] Flying to ${label || 'location'} at ${lat}, ${lng}`);
    setVisualTarget({ lat, lng, height: height || 500000 });
  }, []);

  const setItinerary = useCallback((plan: ItineraryPlan) => {
    console.log('[GlobeControl] Setting itinerary:', plan.title);
    
    if (!plan.days || !Array.isArray(plan.days)) {
      console.warn('[GlobeControl] Invalid plan - no days array');
      return;
    }

    // Convert plan to destinations
    const newDestinations: GlobeDestination[] = plan.days.map((day, i) => ({
      id: generateId(),
      name: day.title || `Day ${day.dayNumber}`,
      lat: day.anchorLocation?.location?.lat || 0,
      lng: day.anchorLocation?.location?.lng || 0,
      day: day.dayNumber || i + 1,
      activities: day.activities || [],
      color: getColorForDay(day.dayNumber || i + 1),
    }));

    // Create routes connecting destinations
    const newRoutes: TravelRoute[] = [];
    for (let i = 0; i < newDestinations.length - 1; i++) {
      newRoutes.push({
        id: generateId(),
        fromId: newDestinations[i].id,
        toId: newDestinations[i + 1].id,
        fromLat: newDestinations[i].lat,
        fromLng: newDestinations[i].lng,
        toLat: newDestinations[i + 1].lat,
        toLng: newDestinations[i + 1].lng,
        mode: 'flight',
      });
    }

    setDestinations(newDestinations);
    setRoutes(newRoutes);
    
    // Select first destination and fly to it
    if (newDestinations.length > 0) {
      const first = newDestinations[0];
      setSelectedDestination(first.id);
      setVisualTarget({ lat: first.lat, lng: first.lng, height: 50000 });
    }
  }, []);

  const clearItinerary = useCallback(() => {
    setDestinations([]);
    setRoutes([]);
    setSelectedDestination(null);
  }, []);

  const selectDestination = useCallback((id: string | null) => {
    setSelectedDestination(id);
    
    if (id) {
      const dest = destinations.find(d => d.id === id);
      if (dest) {
        setVisualTarget({ lat: dest.lat, lng: dest.lng, height: 15000 });
      }
    }
  }, [destinations]);

  const setHostMarkers = useCallback((hosts: HostMarkerData[]) => {
    setHostMarkersState(hosts);
  }, []);

  const addHostMarkers = useCallback((hosts: HostMarkerData[]) => {
    setHostMarkersState(prev => {
      const existingIds = new Set(prev.map(h => h.id));
      const newHosts = hosts.filter(h => !existingIds.has(h.id));
      return [...prev, ...newHosts];
    });
  }, []);

  const clearHostMarkers = useCallback(() => {
    setHostMarkersState([]);
  }, []);

  const value: GlobeControlContextType = {
    // State
    visualTarget,
    destinations,
    routes,
    selectedDestination,
    hostMarkers,
    // Actions
    flyTo,
    setItinerary,
    clearItinerary,
    selectDestination,
    setHostMarkers,
    addHostMarkers,
    clearHostMarkers,
  };

  return (
    <GlobeControlContext.Provider value={value}>
      {children}
    </GlobeControlContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useGlobeControl() {
  const context = useContext(GlobeControlContext);
  if (!context) {
    throw new Error('useGlobeControl must be used within a GlobeControlProvider');
  }
  return context;
}

/**
 * Safe version that returns null if not in provider (for optional usage)
 */
export function useGlobeControlSafe() {
  return useContext(GlobeControlContext);
}
