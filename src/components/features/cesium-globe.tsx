'use client';

import { useRef, useEffect, useState } from 'react';
import { GlobeDestination, TravelRoute } from '@/types/globe';

// Set Cesium base URL BEFORE importing Cesium
if (typeof window !== 'undefined') {
  (window as any).CESIUM_BASE_URL = '/cesium';
}

// Now import Cesium and Resium
import { Viewer, Entity, PolylineGraphics } from 'resium';
import { 
  Cartesian3, 
  Color, 
  PolylineDashMaterialProperty,
  UrlTemplateImageryProvider,
  buildModuleUrl,
} from 'cesium';
import type { Viewer as CesiumViewer } from 'cesium';

// Set the module base URL
(buildModuleUrl as any).setBaseUrl('/cesium/');

// Use OpenStreetMap tiles (no API key required)
const osmProvider = new UrlTemplateImageryProvider({
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  credit: '© OpenStreetMap contributors',
});

interface CesiumGlobeProps {
  destinations: GlobeDestination[];
  routes: TravelRoute[];
  selectedDestination?: string | null;
  onDestinationClick?: (destination: GlobeDestination) => void;
}

export default function CesiumGlobe({
  destinations,
  routes,
  selectedDestination,
  onDestinationClick,
}: CesiumGlobeProps) {
  const viewerRef = useRef<CesiumViewer | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Fly to destination when selected
  useEffect(() => {
    if (selectedDestination && viewerRef.current && isReady) {
      const dest = destinations.find(d => d.id === selectedDestination);
      if (dest) {
        viewerRef.current.camera.flyTo({
          destination: Cartesian3.fromDegrees(dest.lng, dest.lat, 100000),
          duration: 2,
        });
      }
    }
  }, [selectedDestination, destinations, isReady]);

  // Fly to first destination on initial load
  useEffect(() => {
    if (destinations.length > 0 && viewerRef.current && isReady) {
      const firstDest = destinations[0];
      setTimeout(() => {
        viewerRef.current?.camera.flyTo({
          destination: Cartesian3.fromDegrees(firstDest.lng, firstDest.lat, 800000),
          duration: 3,
        });
      }, 500);
    }
  }, [destinations.length, isReady]);

  return (
    <Viewer
      ref={(e) => {
        if (e?.cesiumElement && !viewerRef.current) {
          viewerRef.current = e.cesiumElement;
          // Use OSM tiles instead of Ion
          const layers = e.cesiumElement.imageryLayers;
          layers.removeAll();
          layers.addImageryProvider(osmProvider);
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
      {/* Destination markers */}
      {destinations.map((dest) => (
        <Entity
          key={dest.id}
          name={dest.name}
          position={Cartesian3.fromDegrees(dest.lng, dest.lat, 0)}
          point={{
            pixelSize: selectedDestination === dest.id ? 20 : 14,
            color: Color.fromCssColorString(dest.color),
            outlineColor: Color.WHITE,
            outlineWidth: 2,
            heightReference: 1, // CLAMP_TO_GROUND
          }}
          label={{
            text: `Day ${dest.day}: ${dest.name}`,
            font: '14px sans-serif',
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            style: 2, // FILL_AND_OUTLINE
            verticalOrigin: 1, // BOTTOM
            pixelOffset: { x: 0, y: -20 } as any,
          }}
          onClick={() => onDestinationClick?.(dest)}
        />
      ))}

      {/* Travel routes */}
      {routes.map((route) => (
        <Entity key={route.id} name={`${route.fromId} to ${route.toId}`}>
          <PolylineGraphics
            positions={Cartesian3.fromDegreesArray([
              route.fromLng, route.fromLat,
              route.toLng, route.toLat,
            ])}
            width={3}
            material={
              new PolylineDashMaterialProperty({
                color: Color.fromCssColorString('#ffb703'),
                dashLength: 16,
              })
            }
            clampToGround={false}
          />
        </Entity>
      ))}
    </Viewer>
  );
}
