'use client';

import { HOSTS, type Host, type HostExperience } from '@/lib/data/hosts';
import type { HostMarkerData } from '@/types/globe';

interface HostPanelProps {
  hosts: HostMarkerData[];
  selectedHostId?: string | null;
  selectedDayNumber?: number;
  addedExperienceIds?: Set<string>;
  onHostClick: (host: HostMarkerData) => void;
  onViewProfile: (host: HostMarkerData) => void;
  onAddExperience: (host: Host, experience: HostExperience) => void;
}

export function HostPanel({
  hosts,
  selectedHostId,
  selectedDayNumber,
  addedExperienceIds,
  onHostClick,
  onViewProfile,
  onAddExperience,
}: HostPanelProps) {
  // Get full host data to access experiences
  const hostsWithExperiences = hosts.map(marker => {
    const fullHost = HOSTS.find(h => h.id === marker.id);
    return { marker, fullHost };
  }).filter(({ fullHost }) => fullHost !== undefined);

  if (hosts.length === 0) {
    return (
      <div className="w-80 flex-shrink-0 bg-[var(--background)]/60 backdrop-blur-xl border-l border-[var(--border)]/50 flex flex-col">
        <div className="p-4 border-b border-[var(--border)]/50">
          <h2 className="font-semibold text-[var(--foreground)] flex items-center gap-2">
            <span>🏠</span>
            <span>Local Hosts</span>
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <div className="text-[var(--muted-foreground)]">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-sm">No hosts found for this destination yet</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-96 flex-shrink-0 bg-[var(--background)]/60 backdrop-blur-xl border-l border-[var(--border)]/50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)]/50">
        <h2 className="font-semibold text-[var(--foreground)] flex items-center gap-2">
          <span>🏠</span>
          <span>Local Hosts</span>
          <span className="ml-auto text-sm font-normal text-[var(--muted-foreground)]">
            {hosts.length} available
          </span>
        </h2>
      </div>

      {/* Scrollable host list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {hostsWithExperiences.map(({ marker, fullHost }) => (
          <HostCardWithExperiences
            key={marker.id}
            marker={marker}
            host={fullHost!}
            isSelected={marker.id === selectedHostId}
            selectedDayNumber={selectedDayNumber}
            addedExperienceIds={addedExperienceIds}
            onClick={() => onHostClick(marker)}
            onViewProfile={() => onViewProfile(marker)}
            onAddExperience={(exp) => onAddExperience(fullHost!, exp)}
          />
        ))}
      </div>
    </div>
  );
}

interface HostCardWithExperiencesProps {
  marker: HostMarkerData;
  host: Host;
  isSelected: boolean;
  selectedDayNumber?: number;
  addedExperienceIds?: Set<string>;
  onClick: () => void;
  onViewProfile: () => void;
  onAddExperience: (experience: HostExperience) => void;
}

function HostCardWithExperiences({
  marker,
  host,
  isSelected,
  selectedDayNumber,
  addedExperienceIds,
  onClick,
  onViewProfile,
  onAddExperience,
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
            src={host.photo}
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
            const isAdded = addedExperienceIds?.has(exp.id);
            
            return (
              <div
                key={exp.id}
                className="p-3 hover:bg-[var(--muted)]/20 transition-colors"
              >
                <div className="flex gap-3">
                  <img
                    src={exp.photos?.[0] || host.photo}
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
                  onClick={() => onAddExperience(exp)}
                  className={`w-full mt-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isAdded 
                      ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-200'
                      : 'bg-[var(--princeton-orange)] text-white hover:bg-[var(--princeton-dark)]'
                  }`}
                >
                  {isAdded 
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
