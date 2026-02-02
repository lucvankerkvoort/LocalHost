'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { CityMarkerData, GlobeDestination, HostMarkerData, PlaceMarkerData, RouteMarkerData } from '@/types/globe';

// Set Cesium base URL BEFORE importing Cesium
if (typeof window !== 'undefined') {
  (window as any).CESIUM_BASE_URL = '/cesium';
}

// Now import Cesium and Resium
import { Viewer, Entity } from 'resium';
import { 
  Cartesian2,
  Cartesian3, 
  Color, 
  HeightReference,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  defined,
} from 'cesium';
import type { Viewer as CesiumViewer, Entity as CesiumEntity } from 'cesium';

// Clean, label-free basemap for a quieter surface.
const cleanImageryProvider = new UrlTemplateImageryProvider({
  url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
  subdomains: ['a', 'b', 'c', 'd'],
  credit: '© OpenStreetMap contributors © CARTO',
});

const MARKER_DEPTH_TEST_DISTANCE = 2500000;
const ROUTE_MARKER_SIZE = 8;
const ROUTE_MARKER_COLOR = '#64748b';
const ROUTE_MARKER_FILL_ALPHA = 0.18;
const ROUTE_MARKER_MAX_DISTANCE_METERS = 120000;
const PLACE_MARKER_DEFAULT_COLOR = '#94a3b8';
const PLACE_MARKER_COLORS: Record<string, string> = {
  landmark: '#ffb703',
  museum: '#219ebc',
  restaurant: '#e63946',
  park: '#2a9d8f',
  neighborhood: '#8ecae6',
  city: '#023047',
};

function getRouteMarkerColor(_marker: RouteMarkerData): string {
  return ROUTE_MARKER_COLOR;
}

function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function getPlaceMarkerColor(marker: PlaceMarkerData): string {
  if (marker.category && PLACE_MARKER_COLORS[marker.category]) {
    return PLACE_MARKER_COLORS[marker.category];
  }
  return PLACE_MARKER_DEFAULT_COLOR;
}

interface CesiumGlobeProps {
  destinations: GlobeDestination[];
  cityMarkers: CityMarkerData[];
  hostMarkers?: HostMarkerData[];
  placeMarkers?: PlaceMarkerData[];
  routeMarkers?: RouteMarkerData[];
  selectedDestination?: string | null;
  onCityMarkerClick?: (marker: CityMarkerData) => void;
  onHostClick?: (host: HostMarkerData) => void;
  visualTarget?: { lat: number; lng: number; height?: number } | null;
  activeItemId?: string | null;
  hoveredItemId?: string | null;
  onItemHover?: (itemId: string | null) => void;
}

// Helper to create circular avatar image from URL
function createCircularAvatar(imageUrl: string, size: number = 48): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      resolve(imageUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      // Draw circular clip
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      
      // Draw image
      ctx.drawImage(img, 0, 0, size, size);
      
      // Draw border
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      
      resolve(canvas.toDataURL());
    };
    
    img.onerror = () => {
      // Fallback: draw a colored circle with initial
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
      ctx.fillStyle = '#2a9d8f';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      
      // Draw house emoji or initial
      ctx.font = `${size * 0.5}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('🏠', size / 2, size / 2);
      
      resolve(canvas.toDataURL());
    };
    
    img.src = imageUrl;
  });
}

export default function CesiumGlobe({
  destinations,
  cityMarkers,
  hostMarkers = [],
  placeMarkers = [],
  routeMarkers = [],
  selectedDestination,
  onCityMarkerClick,
  onHostClick,
  visualTarget,
  activeItemId,
  hoveredItemId,
  onItemHover,
}: CesiumGlobeProps) {
  const viewerRef = useRef<CesiumViewer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hostAvatars, setHostAvatars] = useState<Record<string, string>>({});
  const [hoveredHost, setHoveredHost] = useState<HostMarkerData | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);

  // Find the selected destination to get its day number
  const selectedDest = destinations.find(d => d.id === selectedDestination);
  const selectedDayNumber = selectedDest?.day;

  // Filter route markers to only show those for the selected day
  const filteredRouteMarkers = useMemo(() => {
    const anchorByDay = new Map<number, { lat: number; lng: number }>();
    for (const dest of destinations) {
      anchorByDay.set(dest.day, { lat: dest.lat, lng: dest.lng });
    }

    const scopedMarkers = selectedDayNumber
      ? routeMarkers.filter(marker => marker.dayNumber === selectedDayNumber)
      : routeMarkers;

    return scopedMarkers.filter((marker) => {
      if (!marker.dayNumber) return true;
      const anchor = anchorByDay.get(marker.dayNumber);
      if (!anchor) return true;
      const distance = calculateDistanceMeters(marker.lat, marker.lng, anchor.lat, anchor.lng);
      return distance <= ROUTE_MARKER_MAX_DISTANCE_METERS;
    });
  }, [routeMarkers, selectedDayNumber, destinations]);


  // Pre-load circular avatars for hosts
  useEffect(() => {
    const loadAvatars = async () => {
      const avatars: Record<string, string> = {};
      for (const host of hostMarkers) {
        if (host.photo) {
          avatars[host.id] = await createCircularAvatar(host.photo, 48);
        }
      }
      setHostAvatars(avatars);
    };
    
    if (hostMarkers.length > 0) {
      loadAvatars();
    }
  }, [hostMarkers]);

  // Setup hover detection
  useEffect(() => {
    if (!viewerRef.current || !isReady) return;

    const viewer = viewerRef.current;
    
    // Clean up previous handler
    if (handlerRef.current) {
      handlerRef.current.destroy();
    }

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;

    // Mouse move for hover
    handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
      const pickedObject = viewer.scene.pick(movement.endPosition);
      
      if (defined(pickedObject) && pickedObject.id) {
        const entity = pickedObject.id as CesiumEntity;
        const entityId = entity.id;
        
        // Check if it's a host marker
        if (entityId?.startsWith('host-')) {
          const hostId = entityId.replace('host-', '');
          const host = hostMarkers.find(h => h.id === hostId);
          
          if (host) {
            setHoveredHost(host);
            setHoverPosition({ x: movement.endPosition.x, y: movement.endPosition.y });
            return;
          }
        }

        // Check for route markers (Itinerary Items)
        if (entityId?.startsWith('route-marker-')) {
           const markerId = entityId.replace('route-marker-', '');
           onItemHover?.(markerId);
           setHoveredHost(null); // items are not hosts
           return;
        }
      }
      
      setHoveredHost(null);
      setHoverPosition(null);
      onItemHover?.(null); // Clear item hover if not over a marker
    }, ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [isReady, hostMarkers, onItemHover]);

  // Handle explicit visual target (e.g. from chat command)
  useEffect(() => {
    if (visualTarget && viewerRef.current && isReady) {
      viewerRef.current.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          visualTarget.lng, 
          visualTarget.lat, 
          visualTarget.height || 500000
        ),
        duration: 2,
      });
    }
  }, [visualTarget, isReady]);

  // Fly to destination when selected (only if no explicit visual target overriding it)
  useEffect(() => {
    if (selectedDestination && viewerRef.current && isReady && !visualTarget) {
      const dest = destinations.find(d => d.id === selectedDestination);
      if (dest) {
        viewerRef.current.camera.flyTo({
          destination: Cartesian3.fromDegrees(dest.lng, dest.lat, 15000), // 15km - city level zoom
          duration: 2,
        });
      }
    }
  }, [selectedDestination, destinations, isReady, visualTarget]);

  // Fly to first destination on initial load
  useEffect(() => {
    if (destinations.length > 0 && viewerRef.current && isReady && !selectedDestination && !visualTarget) {
      const firstDest = destinations[0];
      setTimeout(() => {
        viewerRef.current?.camera.flyTo({
          destination: Cartesian3.fromDegrees(firstDest.lng, firstDest.lat, 50000), // 50km - see the city
          duration: 3,
        });
      }, 500);
    }
  }, [destinations.length, isReady]);

  return (
    <>
      <Viewer
        ref={(e) => {
          if (e?.cesiumElement && !viewerRef.current) {
            viewerRef.current = e.cesiumElement;
            // Use label-free tiles for a cleaner surface.
            const layers = e.cesiumElement.imageryLayers;
            layers.removeAll();
            const layer = layers.addImageryProvider(cleanImageryProvider);
            layer.saturation = 0.2;
            layer.brightness = 1.05;
            layer.contrast = 0.9;
            layer.gamma = 0.95;

            e.cesiumElement.scene.globe.showGroundAtmosphere = false;
            e.cesiumElement.scene.fog.enabled = false;
            setIsReady(true);
          }
        }}
        full
        baseLayerPicker={false}
        geocoder={false}
        homeButton={false}
        sceneModePicker={false}
        timeline={false}
        animation={false}
        navigationHelpButton={false}
        fullscreenButton={false}
        infoBox={false}
        selectionIndicator={false}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      >
        {/* City markers */}
        {cityMarkers.map((marker) => {
          const isSelected = Boolean(
            selectedDestination && marker.dayIds.includes(selectedDestination)
          );
          const baseColor = Color.fromCssColorString(marker.color);
          const labelText = marker.name;

          return (
          <Entity
            key={marker.id}
            name={marker.name}
            position={Cartesian3.fromDegrees(marker.lng, marker.lat, 0)}
            point={{
              pixelSize: isSelected ? 22 : 18,
              color: baseColor,
              outlineColor: Color.WHITE,
              outlineWidth: 3,
              heightReference: HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: MARKER_DEPTH_TEST_DISTANCE,
            }}
            label={{
              text: labelText,
              font: '14px sans-serif',
              fillColor: Color.WHITE,
              outlineColor: Color.fromCssColorString('#1a1a2e'),
              outlineWidth: 3,
              style: 2, // FILL_AND_OUTLINE
              verticalOrigin: VerticalOrigin.BOTTOM,
              pixelOffset: { x: 0, y: -20 } as any,
              heightReference: HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: MARKER_DEPTH_TEST_DISTANCE,
              show: isSelected || cityMarkers.length <= 1,
            }}
            onClick={() => onCityMarkerClick?.(marker)}
          />
          );
        })}
        
        {/* Route Lines */}


        {/* Route markers */}
        {filteredRouteMarkers
          .filter((marker) => {
            const isValidLat = typeof marker.lat === 'number' && marker.lat >= -90 && marker.lat <= 90;
            const isValidLng = typeof marker.lng === 'number' && marker.lng >= -180 && marker.lng <= 180;
            const isNotZeroZero = !(marker.lat === 0 && marker.lng === 0);
            return isValidLat && isValidLng && isNotZeroZero;
          })
          .map((marker) => {
            const markerColor = Color.fromCssColorString(getRouteMarkerColor(marker));
            const isActive = activeItemId === marker.id;
            const isHovered = hoveredItemId === marker.id;
            
            // Visual state priority: Active > Hovered > Default
            const size = isActive ? 16 : (isHovered ? 12 : ROUTE_MARKER_SIZE);
            const alpha = isActive ? 0.9 : (isHovered ? 0.7 : ROUTE_MARKER_FILL_ALPHA);
            const outlineWidth = isActive ? 4 : (isHovered ? 3 : 2);
            
            return (
              <Entity
                key={`route-marker-${marker.id}`}
                id={`route-marker-${marker.id}`}
                name={marker.name ?? 'Route marker'}
                position={Cartesian3.fromDegrees(marker.lng, marker.lat, 0)}
                point={{
                  pixelSize: size,
                  color: markerColor.withAlpha(alpha),
                  outlineColor: markerColor,
                  outlineWidth: outlineWidth,
                  heightReference: HeightReference.CLAMP_TO_GROUND,
                  disableDepthTestDistance: MARKER_DEPTH_TEST_DISTANCE,
                }}
                label={{
                  text: marker.name ?? '',
                  font: isActive ? 'bold 14px sans-serif' : '11px sans-serif',
                  fillColor: markerColor.withAlpha(0.95),
                  outlineColor: Color.WHITE,
                  outlineWidth: 2,
                  style: 2, // FILL_AND_OUTLINE
                  verticalOrigin: VerticalOrigin.BOTTOM,
                  pixelOffset: new Cartesian2(0, isActive ? -20 : -12),
                  heightReference: HeightReference.CLAMP_TO_GROUND,
                  disableDepthTestDistance: MARKER_DEPTH_TEST_DISTANCE,
                  show: Boolean(marker.name) || isActive || isHovered,
                }}
              />
            );
          })}

        {/* Place markers */}
        {placeMarkers
          .filter((marker) => {
            const isValidLat = typeof marker.lat === 'number' && marker.lat >= -90 && marker.lat <= 90;
            const isValidLng = typeof marker.lng === 'number' && marker.lng >= -180 && marker.lng <= 180;
            const isNotZeroZero = !(marker.lat === 0 && marker.lng === 0);
            return isValidLat && isValidLng && isNotZeroZero;
          })
          .map((marker) => (
            <Entity
              key={`place-${marker.id}`}
              id={`place-${marker.id}`}
              name={marker.name}
              position={Cartesian3.fromDegrees(marker.lng, marker.lat, 0)}
              point={{
                pixelSize: 10,
                color: Color.fromCssColorString(getPlaceMarkerColor(marker)).withAlpha(0.85),
                outlineColor: Color.WHITE,
                outlineWidth: 1.5,
                heightReference: HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: MARKER_DEPTH_TEST_DISTANCE,
              }}
            />
          ))}

        {/* Host markers - billboard with photo */}
        {hostMarkers
          .filter((host) => {
            // Skip invalid coordinates (0,0 is in the ocean, and validate ranges)
            const isValidLat = typeof host.lat === 'number' && host.lat >= -90 && host.lat <= 90;
            const isValidLng = typeof host.lng === 'number' && host.lng >= -180 && host.lng <= 180;
            const isNotZeroZero = !(host.lat === 0 && host.lng === 0);
            return isValidLat && isValidLng && isNotZeroZero;
          })
          .map((host) => (
          <Entity
            key={`host-${host.id}`}
            id={`host-${host.id}`}
            name={host.name}
            position={Cartesian3.fromDegrees(host.lng, host.lat, 0)}
            billboard={{
              image: hostAvatars[host.id] || undefined,
              width: 44,
              height: 44,
              heightReference: HeightReference.CLAMP_TO_GROUND,
              verticalOrigin: VerticalOrigin.BOTTOM,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              // Fallback color if no image
              color: hostAvatars[host.id] ? Color.WHITE : Color.fromCssColorString('#2a9d8f'),
            }}
            onClick={() => onHostClick?.(host)}
          />
        ))}
      </Viewer>

      {/* Hover Card Overlay */}
      {hoveredHost && hoverPosition && (
        <div
          className="absolute z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: hoverPosition.x + 20,
            top: hoverPosition.y - 60,
            maxWidth: '280px',
          }}
        >
          <div className="bg-white rounded-xl shadow-xl border border-[var(--border)] overflow-hidden">
            {/* Header with photo */}
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-[var(--blue-green)]/10 to-transparent">
              <img
                src={hoveredHost.photo || '/placeholder-host.jpg'}
                alt={hoveredHost.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm"
              />
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-[var(--foreground)] truncate">
                  {hoveredHost.name}
                </h4>
                <p className="text-xs text-[var(--muted-foreground)]">Local Host</p>
              </div>
              {hoveredHost.rating && (
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-[var(--sunset-orange)]">★</span>
                  <span className="font-medium">{hoveredHost.rating}</span>
                </div>
              )}
            </div>
            
            {/* Quick info */}
            <div className="px-3 pb-3 pt-1">
              {hoveredHost.headline && (
                <p className="text-sm text-[var(--muted-foreground)] line-clamp-2 mb-2">
                  {hoveredHost.headline}
                </p>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--blue-green)] font-medium">
                  Click to view details
                </span>
                {hoveredHost.experienceCount && (
                  <span className="text-[var(--muted-foreground)]">
                    {hoveredHost.experienceCount} {hoveredHost.experienceCount === 1 ? 'experience' : 'experiences'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
