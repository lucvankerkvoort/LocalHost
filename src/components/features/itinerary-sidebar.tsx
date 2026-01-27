'use client';

import { useState } from 'react';
import { ItineraryDay, ExperienceItem, FILLER_TYPE_CONFIG } from '@/types/itinerary-plan';
import { AnchorCard } from './anchor-card';

interface ItinerarySidebarProps {
  days: ItineraryDay[];
  selectedDayId: string | null;
  selectedAnchorId: string | null;
  onSelectDay: (dayId: string) => void;
  onSelectAnchor: (anchorId: string | null) => void;
  onBookAnchor: (dayId: string) => void;
  onRemoveAnchor: (dayId: string) => void;
  onAddExperience: (dayId: string) => void;
}

/**
 * Sidebar showing itinerary days with tabs and anchor cards.
 */
export function ItinerarySidebar({
  days,
  selectedDayId,
  selectedAnchorId,
  onSelectDay,
  onSelectAnchor,
  onBookAnchor,
  onRemoveAnchor,
  onAddExperience,
}: ItinerarySidebarProps) {
  const selectedDay = days.find(d => d.id === selectedDayId);

  return (
    <div className="flex flex-col h-full bg-[var(--background)] border-l border-[var(--border)]">
      {/* Day Tabs */}
      <div className="flex overflow-x-auto border-b border-[var(--border)] bg-[var(--muted)]">
        {days.map((day) => {
          const isSelected = day.id === selectedDayId;
          const hasAnchor = !!day.anchor;
          const anchorStatus = day.anchor?.status;
          
          return (
            <button
              key={day.id}
              onClick={() => onSelectDay(day.id)}
              className={`flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors relative ${
                isSelected
                  ? 'bg-[var(--background)] text-[var(--foreground)]'
                  : 'text-[var(--muted-foreground)] hover:bg-[var(--background)]/50'
              }`}
            >
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs text-[var(--muted-foreground)]">
                  {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <span>Day {day.dayNumber}</span>
                <span className="text-xs">{day.location.city}</span>
              </div>
              
              {/* Status indicator dot */}
              {hasAnchor && (
                <div 
                  className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                    anchorStatus === 'BOOKED' ? 'bg-green-500' :
                    anchorStatus === 'PENDING' ? 'bg-amber-500 animate-pulse' :
                    anchorStatus === 'FAILED' ? 'bg-red-500' :
                    'bg-gray-400'
                  }`}
                />
              )}
              
              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--princeton-orange)]" />
              )}
            </button>
          );
        })}
      </div>
      
      {/* Day Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedDay ? (
          <div className="space-y-4">
            {/* Day Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[var(--foreground)]">
                  Day {selectedDay.dayNumber} - {selectedDay.location.city}
                </h3>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {new Date(selectedDay.date).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </p>
              </div>
            </div>
            
            {/* Anchor Section */}
            <div>
              <h4 className="text-sm font-medium text-[var(--muted-foreground)] mb-2 flex items-center gap-2">
                <span>⚓</span>
                <span>Localhost Experience</span>
              </h4>
              
              {selectedDay.anchor ? (
                <AnchorCard
                  anchor={selectedDay.anchor}
                  dayNumber={selectedDay.dayNumber}
                  isSelected={selectedAnchorId === selectedDay.anchor.id}
                  onSelect={() => onSelectAnchor(selectedDay.anchor?.id || null)}
                  onBook={() => onBookAnchor(selectedDay.id)}
                  onRemove={() => onRemoveAnchor(selectedDay.id)}
                />
              ) : (
                <button
                  onClick={() => onAddExperience(selectedDay.id)}
                  className="w-full py-8 border-2 border-dashed border-[var(--border)] rounded-xl text-[var(--muted-foreground)] hover:border-[var(--princeton-orange)] hover:text-[var(--princeton-orange)] transition-colors flex flex-col items-center gap-2"
                >
                  <span className="text-2xl">+</span>
                  <span className="text-sm font-medium">Add Localhost Experience</span>
                  <span className="text-xs">Find a local host for this day</span>
                </button>
              )}
            </div>
            
            {/* Fillers Section */}
            {selectedDay.fillers.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-[var(--muted-foreground)] mb-2">
                  Other Activities
                </h4>
                <div className="space-y-2">
                  {selectedDay.fillers.map((filler) => {
                    const config = FILLER_TYPE_CONFIG[filler.type];
                    return (
                      <div
                        key={filler.id}
                        className="p-3 bg-[var(--muted)] rounded-lg flex items-start gap-3"
                      >
                        <span className="text-lg">{config.icon}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {filler.time && (
                              <span className="text-xs text-[var(--muted-foreground)]">
                                {filler.time}
                              </span>
                            )}
                            <span className="font-medium text-sm">{filler.title}</span>
                          </div>
                          {filler.description && (
                            <p className="text-xs text-[var(--muted-foreground)] mt-1">
                              {filler.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--muted-foreground)]">
            Select a day to view details
          </div>
        )}
      </div>
    </div>
  );
}
