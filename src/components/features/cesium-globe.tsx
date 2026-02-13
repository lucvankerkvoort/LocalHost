'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import type { LucideIcon } from 'lucide-react';
import { MapPin, Landmark, Building2, Utensils, Trees, Map as MapIcon } from 'lucide-react';
import { CityMarkerData, GlobeDestination, HostMarkerData, PlaceMarkerData, RouteMarkerData, TravelRoute } from '@/types/globe';

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
  }
}

// Set Cesium base URL BEFORE importing Cesium
if (typeof window !== 'undefined') {
  window.CESIUM_BASE_URL = '/cesium';
}

// Now import Cesium and Resium
import { Viewer, Entity } from 'resium';
import { 
  ArcType,
  Cartesian2,
  Cartesian3, 
  Color, 
  HeightReference,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Rectangle,
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
const ROUTE_MARKER_COLOR = '#64748b';
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
const LUCIDE_STROKE_WIDTH = 2.25;
const CITY_MARKER_FALLBACK_COLOR = '#fb8500';
const CITY_MARKER_ICON_SIZE = 26;
const CITY_MARKER_ICON_SELECTED_SIZE = 30;
const ROUTE_MARKER_ICON_SIZE = 16;
const ROUTE_MARKER_ICON_HOVER_SIZE = 20;
const ROUTE_MARKER_ICON_ACTIVE_SIZE = 24;
const PLACE_MARKER_ICON_SIZE = 14;
const PLACE_MARKER_ICON_MAP: Record<string, { icon: LucideIcon; name: string }> = {
  landmark: { icon: Landmark, name: 'Landmark' },
  museum: { icon: Building2, name: 'Building2' },
  restaurant: { icon: Utensils, name: 'Utensils' },
  park: { icon: Trees, name: 'Trees' },
  neighborhood: { icon: MapIcon, name: 'Map' },
  city: { icon: MapPin, name: 'MapPin' },
};
const LUCIDE_ICON_CACHE = new Map<string, string>();

function getRouteMarkerColor(_marker: RouteMarkerData): string {
  return ROUTE_MARKER_COLOR;
}

function encodeSvgData(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function getLucideIconDataUrl(
  iconName: string,
  Icon: LucideIcon,
  options: { color: string; size: number; strokeWidth?: number }
): string {
  const strokeWidth = options.strokeWidth ?? LUCIDE_STROKE_WIDTH;
  const cacheKey = `${iconName}-${options.color}-${options.size}-${strokeWidth}`;
  const cached = LUCIDE_ICON_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const svg = renderToStaticMarkup(
    <Icon color={options.color} size={options.size} strokeWidth={strokeWidth} />
  );
  const dataUrl = encodeSvgData(svg);
  LUCIDE_ICON_CACHE.set(cacheKey, dataUrl);
  return dataUrl;
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

function getPlaceMarkerIcon(marker: PlaceMarkerData) {
  if (marker.category && PLACE_MARKER_ICON_MAP[marker.category]) {
    return PLACE_MARKER_ICON_MAP[marker.category];
  }
  return { icon: MapPin, name: 'MapPin' };
}

function getBoundingRectangle(locations: { lat: number; lng: number }[]) {
  if (!locations || locations.length < 2) return null;
  
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  locations.forEach(loc => {
    minLat = Math.min(minLat, loc.lat);
    maxLat = Math.max(maxLat, loc.lat);
    minLng = Math.min(minLng, loc.lng);
    maxLng = Math.max(maxLng, loc.lng);
  });
  
  // Add some padding
  const padding = 0.5; 
  return Rectangle.fromDegrees(minLng - padding, minLat - padding, maxLng + padding, maxLat + padding);
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

interface CesiumGlobeProps {
  destinations: GlobeDestination[];
  cityMarkers: CityMarkerData[];
  hostMarkers?: HostMarkerData[];
  placeMarkers?: PlaceMarkerData[];
  routeMarkers?: RouteMarkerData[];
  routes?: TravelRoute[];
  selectedDestination?: string | null;
  onCityMarkerClick?: (marker: CityMarkerData) => void;
  onHostClick?: (host: HostMarkerData) => void;
  onMapBackgroundClick?: () => void;
  visualTarget?: { lat: number; lng: number; height?: number } | null;
  activeItemId?: string | null;
  hoveredItemId?: string | null;
  onItemHover?: (itemId: string | null) => void;
  onZoomChange?: (height: number) => void;
}

// ... (existing code)

export default function CesiumGlobe({
  destinations,
  cityMarkers,
  hostMarkers = [],
  placeMarkers = [],
  routeMarkers = [],
  routes = [],
  selectedDestination,
  onCityMarkerClick,
  onHostClick,
  onMapBackgroundClick,
  visualTarget,
  activeItemId,
  hoveredItemId,
  onItemHover,
  onZoomChange,
}: CesiumGlobeProps) {
  const viewerRef = useRef<CesiumViewer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hostAvatars, setHostAvatars] = useState<Record<string, string>>({});
  const [hoveredHost, setHoveredHost] = useState<HostMarkerData | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const zoomHeightRef = useRef<number | null>(null);
  const initialFlightRef = useRef(false);
  const skipNextSelectionFlyRef = useRef(false);

  const cityMarkersKey = useMemo(
    () => cityMarkers.map((marker) => `${marker.id}:${marker.lat}:${marker.lng}`).join('|'),
    [cityMarkers]
  );

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

  useEffect(() => {
    initialFlightRef.current = false;
    skipNextSelectionFlyRef.current = false;
  }, [cityMarkersKey]);

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

    handler.setInputAction((movement: { position: Cartesian2 }) => {
      const pickedObject = viewer.scene.pick(movement.position);
      if (!defined(pickedObject) || !pickedObject.id) {
        onMapBackgroundClick?.();
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [isReady, hostMarkers, onItemHover, onMapBackgroundClick]);

  useEffect(() => {
    if (!viewerRef.current || !isReady || !onZoomChange) return;

    const camera = viewerRef.current.camera;
    const ellipsoid = viewerRef.current.scene.globe.ellipsoid;

    const emitZoomHeight = () => {
      const height =
        camera.positionCartographic?.height ??
        ellipsoid.cartesianToCartographic(camera.position).height;

      if (!Number.isFinite(height)) return;

      const rounded = Math.round(height);
      if (zoomHeightRef.current === rounded) return;
      zoomHeightRef.current = rounded;
      onZoomChange(rounded);
    };

    emitZoomHeight();
    camera.moveEnd.addEventListener(emitZoomHeight);

    return () => {
      camera.moveEnd.removeEventListener(emitZoomHeight);
    };
  }, [isReady, onZoomChange]);

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

  // Initial camera framing: show all city markers for multi-city drafts
  useEffect(() => {
    if (!viewerRef.current || !isReady || visualTarget) return;
    if (initialFlightRef.current) return;

    if (cityMarkers.length >= 2) {
      const rect = getBoundingRectangle(
        cityMarkers.map((marker) => ({ lat: marker.lat, lng: marker.lng }))
      );
      if (rect) {
        initialFlightRef.current = true;
        skipNextSelectionFlyRef.current = true;
        viewerRef.current.camera.flyTo({
          destination: rect,
          duration: 2,
        });
        return;
      }
    }

    if (destinations.length > 0) {
      const firstDest = destinations[0];
      initialFlightRef.current = true;
      const timer = window.setTimeout(() => {
        viewerRef.current?.camera.flyTo({
          destination: Cartesian3.fromDegrees(firstDest.lng, firstDest.lat, 50000), // 50km - see the city
          duration: 3,
        });
      }, 500);
      return () => window.clearTimeout(timer);
    }
  }, [cityMarkers, destinations, isReady, visualTarget]);

  // Fly to destination when selected (only if no explicit visual target overriding it)
  useEffect(() => {
    if (selectedDestination && viewerRef.current && isReady && !visualTarget) {
      if (skipNextSelectionFlyRef.current) {
        skipNextSelectionFlyRef.current = false;
        return;
      }
      const dest = destinations.find(d => d.id === selectedDestination);
      if (dest) {
        // Check for multi-location anchor
        if (dest.locations && dest.locations.length > 1) {
          const rect = getBoundingRectangle(dest.locations);
          if (rect) {
            viewerRef.current.camera.flyTo({
              destination: rect,
              duration: 2,
            });
            return;
          }
        }

        // Fallback to single point flyTo
        viewerRef.current.camera.flyTo({
          destination: Cartesian3.fromDegrees(dest.lng, dest.lat, 15000), // 15km - city level zoom
          duration: 2,
        });
      }
    }
  }, [selectedDestination, destinations, isReady, visualTarget]);

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
          const labelText = marker.name;
          const iconSize = isSelected ? CITY_MARKER_ICON_SELECTED_SIZE : CITY_MARKER_ICON_SIZE;
          const cityColor = marker.color.toLowerCase() === ROUTE_MARKER_COLOR
            ? CITY_MARKER_FALLBACK_COLOR
            : marker.color;
          const iconUrl = getLucideIconDataUrl('MapPin', MapPin, {
            color: cityColor,
            size: iconSize,
          });

          return (
          <Entity
            key={marker.id}
            name={marker.name}
            position={Cartesian3.fromDegrees(marker.lng, marker.lat, 0)}
            billboard={{
              image: iconUrl,
              width: iconSize,
              height: iconSize,
              heightReference: HeightReference.CLAMP_TO_GROUND,
              verticalOrigin: VerticalOrigin.BOTTOM,
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
              pixelOffset: new Cartesian2(0, -(iconSize + 6)),
              heightReference: HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: MARKER_DEPTH_TEST_DISTANCE,
              show: isSelected || cityMarkers.length <= 1,
            }}
            onClick={() => onCityMarkerClick?.(marker)}
          />
          );
        })}
        
        {/* Route Lines (Road Trip Anchors) */}
        {destinations.map(dest => {
          if (dest.type === 'ROAD_TRIP' && dest.locations && dest.locations.length > 1) {
             const positions = dest.locations.map(loc => Cartesian3.fromDegrees(loc.lng, loc.lat));
             return (
               <Entity
                 key={`polyline-${dest.id}`}
                 polyline={{
                   positions: positions,
                   width: 5,
                   material: Color.fromCssColorString(dest.color || '#fb8500').withAlpha(0.8),
                   clampToGround: true,
                 }}
               />
             );
          }
          return null;
        })}

        {/* Inter-City Travel Routes */}
        {routes.map((route) => {
           // Skip if we are filtering by day and this route is for a different day
           // (Optional: usually we want to see the whole trip context, or just the current leg)
           // For now, show all routes to give the "Grand Tour" feel
           
           const isFlight = route.mode === 'flight';
           const color = isFlight ? Color.fromCssColorString('#8ecae6') : Color.fromCssColorString('#fb8500');
           
           return (
             <Entity
               key={`route-${route.id}`}
               polyline={{
                 positions: [
                   Cartesian3.fromDegrees(route.fromLng, route.fromLat),
                   Cartesian3.fromDegrees(route.toLng, route.toLat)
                 ],
                 width: isFlight ? 3 : 4,
                 material: color.withAlpha(0.7),
                 arcType: isFlight ? ArcType.GEODESIC : ArcType.RHUMB,
                 clampToGround: false, // Arcs need to fly
               }}
             />
           );
        })}


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
            const iconSize = isActive
              ? ROUTE_MARKER_ICON_ACTIVE_SIZE
              : (isHovered ? ROUTE_MARKER_ICON_HOVER_SIZE : ROUTE_MARKER_ICON_SIZE);
            const iconUrl = getLucideIconDataUrl('MapPin', MapPin, {
              color: ROUTE_MARKER_COLOR,
              size: iconSize,
            });
            
            return (
              <Entity
                key={`route-marker-${marker.id}`}
                id={`route-marker-${marker.id}`}
                name={marker.name ?? 'Route marker'}
                position={Cartesian3.fromDegrees(marker.lng, marker.lat, 0)}
                billboard={{
                  image: iconUrl,
                  width: iconSize,
                  height: iconSize,
                  heightReference: HeightReference.CLAMP_TO_GROUND,
                  verticalOrigin: VerticalOrigin.BOTTOM,
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
                  pixelOffset: new Cartesian2(0, -(iconSize + 6)),
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
          .map((marker) => {
            const iconInfo = getPlaceMarkerIcon(marker);
            const iconColor = Color.fromCssColorString(getPlaceMarkerColor(marker))
              .withAlpha(0.85)
              .toCssColorString();
            const iconUrl = getLucideIconDataUrl(iconInfo.name, iconInfo.icon, {
              color: iconColor,
              size: PLACE_MARKER_ICON_SIZE,
            });

            return (
              <Entity
                key={`place-${marker.id}`}
                id={`place-${marker.id}`}
                name={marker.name}
                position={Cartesian3.fromDegrees(marker.lng, marker.lat, 0)}
                billboard={{
                  image: iconUrl,
                  width: PLACE_MARKER_ICON_SIZE,
                  height: PLACE_MARKER_ICON_SIZE,
                  heightReference: HeightReference.CLAMP_TO_GROUND,
                  verticalOrigin: VerticalOrigin.BOTTOM,
                  disableDepthTestDistance: MARKER_DEPTH_TEST_DISTANCE,
                }}
              />
            );
          })}

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
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-[var(--secondary)]/10 to-transparent">
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
                  <span className="text-[var(--accent)]">★</span>
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
                <span className="text-[var(--primary)] font-medium">
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
