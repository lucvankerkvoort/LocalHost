'use client';

import { Entity, EllipseGraphics } from 'resium';
import { Cartesian3, Color, HeightReference } from 'cesium';
import { ExperienceItem, EXPERIENCE_STATUS_CONFIG } from '@/types/itinerary-plan';

interface AnchorMarkersProps {
  anchors: Array<{
    dayId: string;
    dayNumber: number;
    anchor: ExperienceItem;
  }>;
  selectedAnchorId: string | null;
  selectedDayId: string | null;
  onAnchorClick: (anchor: ExperienceItem, dayId: string) => void;
}

/**
 * Renders anchor markers on the Cesium globe.
 * Supports exact pins, fuzzy areas (circles), and visual status indicators.
 */
export function AnchorMarkers({
  anchors,
  selectedAnchorId,
  selectedDayId,
  onAnchorClick,
}: AnchorMarkersProps) {
  return (
    <>
      {anchors.map(({ dayId, dayNumber, anchor }) => {
        const config = EXPERIENCE_STATUS_CONFIG[anchor.status];
        const isSelected = selectedAnchorId === anchor.id;
        const isDaySelected = selectedDayId === dayId;
        
        // Skip if no location coordinates
        if (!anchor.location.lat || !anchor.location.lng) return null;
        
        const position = Cartesian3.fromDegrees(
          anchor.location.lng,
          anchor.location.lat,
          0
        );
        
        // Render based on location type
        if (anchor.location.type === 'area' && anchor.location.radiusMeters) {
          // Fuzzy area - render as circle
          return (
            <Entity
              key={anchor.id}
              name={anchor.title}
              position={position}
              onClick={() => onAnchorClick(anchor, dayId)}
            >
              <EllipseGraphics
                semiMajorAxis={anchor.location.radiusMeters}
                semiMinorAxis={anchor.location.radiusMeters}
                material={Color.fromCssColorString(config.color).withAlpha(0.3)}
                outline
                outlineColor={Color.fromCssColorString(config.color)}
                outlineWidth={2}
                heightReference={HeightReference.CLAMP_TO_GROUND}
              />
            </Entity>
          );
        }
        
        // Exact or hidden location - render as point marker
        const baseSize = 16;
        const size = isSelected ? baseSize * 1.5 : baseSize;
        const opacity = isDaySelected ? config.mapOpacity : config.mapOpacity * 0.5;
        
        return (
          <Entity
            key={anchor.id}
            name={anchor.title}
            position={position}
            point={{
              pixelSize: size,
              color: Color.fromCssColorString(config.color).withAlpha(opacity),
              outlineColor: isSelected ? Color.WHITE : Color.fromCssColorString(config.color),
              outlineWidth: isSelected ? 3 : 2,
              heightReference: HeightReference.CLAMP_TO_GROUND,
            }}
            label={{
              text: `Day ${dayNumber}: ${anchor.title.substring(0, 20)}${anchor.title.length > 20 ? '...' : ''}`,
              font: isSelected ? 'bold 14px sans-serif' : '12px sans-serif',
              fillColor: Color.WHITE,
              outlineColor: Color.BLACK,
              outlineWidth: 2,
              style: 2, // FILL_AND_OUTLINE
              verticalOrigin: 1, // BOTTOM
              pixelOffset: { x: 0, y: -20 } as any,
              show: isDaySelected || isSelected,
            }}
            onClick={() => onAnchorClick(anchor, dayId)}
          />
        );
      })}
    </>
  );
}
