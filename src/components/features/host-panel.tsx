'use client';

import type { HostMarkerData } from '@/types/globe';
import type { PlannerExperience, PlannerExperienceHost } from '@/types/planner-experiences';
import { getHostExperienceCtaState } from './host-panel-state';

import { Home } from 'lucide-react';

interface HostPanelProps {
  variant?: 'sidebar' | 'panel';
  hosts: PlannerExperienceHost[];
  hostMarkers: HostMarkerData[];
  selectedHostId?: string | null;
  selectedDayNumber?: number;
  addedExperienceIds?: Set<string>;
  bookedExperienceIds?: Set<string>;
  onHostClick: (host: HostMarkerData) => void;
  onViewProfile: (host: HostMarkerData) => void;
  onAddExperience: (host: PlannerExperienceHost, experience: PlannerExperience, marker: HostMarkerData) => void;
  onFocusExperience?: (host: PlannerExperienceHost, experience: PlannerExperience, marker: HostMarkerData) => void;
}

export function HostPanel({
  variant = 'sidebar',
  hosts,
  hostMarkers,
  selectedHostId,
  selectedDayNumber,
  addedExperienceIds,
  bookedExperienceIds,
  onHostClick,
  onViewProfile,
  onAddExperience,
  onFocusExperience,
}: HostPanelProps) {
  const hostsWithMarkers = hosts.map((host) => {
    const marker =
      hostMarkers.find((item) => item.hostId === host.id || item.id === host.id) ??
      ({
        id: host.id,
        hostId: host.id,
        name: host.name,
        lat: host.marker.lat,
        lng: host.marker.lng,
        photo: host.photo ?? undefined,
        headline: host.quote ?? undefined,
        experienceCount: host.experiences.length,
      } satisfies HostMarkerData);
    return { host, marker };
  });

  const containerClasses = variant === 'panel'
    ? 'w-full border-transparent'
    : 'w-96 border-l border-[var(--border)]/50';
  const emptyContainerClasses = variant === 'panel'
    ? 'w-full border-transparent'
    : 'w-80 border-l border-[var(--border)]/50';
  const headerLabel = variant === 'panel' ? 'Experiences' : 'Local Hosts';

  if (hosts.length === 0) {
    return (
      <div className={`${emptyContainerClasses} flex-1 min-h-0 bg-[var(--background)]/60 backdrop-blur-xl flex flex-col`}>
        <div className="p-4 border-b border-[var(--border)]/50">
          <h2 className="font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Home className="w-5 h-5 text-[var(--princeton-orange)]" />
            <span>{headerLabel}</span>
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <div className="text-[var(--muted-foreground)]">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-sm">
              {variant === 'panel'
                ? 'No experiences found for this destination yet'
                : 'No hosts found for this destination yet'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${containerClasses} flex-1 min-h-0 bg-[var(--background)]/60 backdrop-blur-xl flex flex-col`}>
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)]/50">
        <h2 className="font-semibold text-[var(--foreground)] flex items-center gap-2">
          <Home className="w-5 h-5 text-[var(--princeton-orange)]" />
          <span>{headerLabel}</span>
          <span className="ml-auto text-sm font-normal text-[var(--muted-foreground)]">
            {hosts.length} available
          </span>
        </h2>
      </div>

      {/* Scrollable host list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {hostsWithMarkers.map(({ marker, host }) => (
          <HostCardWithExperiences
            key={marker.id}
            marker={marker}
            host={host}
            isSelected={marker.id === selectedHostId || marker.hostId === selectedHostId}
            selectedDayNumber={selectedDayNumber}
            addedExperienceIds={addedExperienceIds}
            bookedExperienceIds={bookedExperienceIds}
            onClick={() => onHostClick(marker)}
            onViewProfile={() => onViewProfile(marker)}
            onAddExperience={(exp) => onAddExperience(host, exp, marker)}
            onFocusExperience={(exp) => onFocusExperience?.(host, exp, marker)}
          />
        ))}
      </div>
    </div>
  );
}

interface HostCardWithExperiencesProps {
  marker: HostMarkerData;
  host: PlannerExperienceHost;
  isSelected: boolean;
  selectedDayNumber?: number;
  addedExperienceIds?: Set<string>;
  bookedExperienceIds?: Set<string>;
  onClick: () => void;
  onViewProfile: () => void;
  onAddExperience: (experience: PlannerExperience) => void;
  onFocusExperience?: (experience: PlannerExperience) => void;
}

function HostCardWithExperiences({
  marker,
  host,
  isSelected,
  selectedDayNumber,
  addedExperienceIds,
  bookedExperienceIds,
  onClick,
  onViewProfile,
  onAddExperience,
  onFocusExperience,
}: HostCardWithExperiencesProps) {
  return (
    <div
      className={`
        bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm rounded-xl border overflow-hidden 
        shadow-sm hover:shadow-md transition-all
        ${isSelected 
          ? 'border-[var(--princeton-orange)] ring-2 ring-[var(--princeton-orange)]/20' 
          : 'border-[var(--border)]/50'
        }
      `}
    >
      {/* Host photo + info header */}
      <div 
        className="p-4 cursor-pointer hover:bg-[var(--muted)]/30 transition-colors"
        onClick={onClick}
      >
        <div className="flex items-start gap-3">
          <img
            src={host.photo ?? ''}
            alt={host.name}
            className="w-12 h-12 rounded-full object-cover flex-shrink-0 ring-2 ring-[var(--border)]"
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[var(--foreground)] truncate">
              {host.name}
            </h3>
            <p className="text-xs text-[var(--muted-foreground)] line-clamp-1 mt-0.5 italic">
              "{host.quote}"
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewProfile();
            }}
            className="text-xs text-[var(--blue-green)] hover:underline"
          >
            Profile
          </button>
        </div>
      </div>

      {/* Experiences List */}
      <div className="border-t border-[var(--border)]/50">
        <div className="px-4 py-2 bg-[var(--muted)]/30">
          <span className="text-xs font-medium text-[var(--muted-foreground)]">
            {host.experiences.length} Experience{host.experiences.length > 1 ? 's' : ''}
          </span>
        </div>
        
        <div className="divide-y divide-[var(--border)]/30">
          {host.experiences.map((exp) => {
            const isAdded = addedExperienceIds?.has(exp.id) ?? false;
            const isBooked = bookedExperienceIds?.has(exp.id) ?? false;
            const ctaState = getHostExperienceCtaState(isAdded, isBooked);
            
            return (
              <div
                key={exp.id}
                className="p-3 hover:bg-[var(--muted)]/20 transition-colors"
                onClick={() => onFocusExperience?.(exp)}
              >
                <div className="flex gap-3">
                  <img
                    src={exp.photos?.[0] || host.photo || ''}
                    alt={exp.title}
                    className="w-16 h-12 rounded-lg object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-[var(--foreground)] line-clamp-1">
                      {exp.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1 text-xs text-[var(--muted-foreground)]">
                      <span>⏱ {Math.round(exp.duration / 60)}h</span>
                      <span className="text-amber-500">★ {exp.rating}</span>
                      <span className="ml-auto font-semibold text-[var(--foreground)]">
                        ${(exp.price / 100).toFixed(0)}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    if (ctaState === 'BOOKED') return;
                    onAddExperience(exp);
                  }}
                  disabled={ctaState === 'BOOKED'}
                  className={`w-full mt-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    ctaState === 'BOOKED'
                      ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-200 cursor-not-allowed'
                      : ctaState === 'REMOVE'
                      ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-200'
                      : 'bg-[var(--princeton-orange)] text-white hover:bg-[var(--princeton-dark)]'
                  }`}
                >
                  {ctaState === 'BOOKED'
                    ? 'Booked'
                    : ctaState === 'REMOVE'
                    ? 'Remove from Day' 
                    : selectedDayNumber ? `Add to Day ${selectedDayNumber}` : 'Add to Trip'
                  }
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
