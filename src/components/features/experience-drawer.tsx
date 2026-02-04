'use client';

import type { Host, HostExperience } from '@/lib/data/hosts';
import type { HostMarkerData } from '@/types/globe';
import { HostPanel } from './host-panel';

interface ExperienceDrawerProps {
  isOpen: boolean;
  city: string;
  hosts: HostMarkerData[];
  selectedHostId?: string | null;
  selectedDayNumber?: number;
  addedExperienceIds?: Set<string>;
  bookedExperienceIds?: Set<string>;
  onClose: () => void;
  onHostClick: (host: HostMarkerData) => void;
  onViewProfile: (host: HostMarkerData) => void;
  onFocusExperience: (host: Host, experience: HostExperience) => void;
  onAddExperience: (host: Host, experience: HostExperience) => void;
}

/**
 * Slide-in drawer for browsing and adding Localhost experiences.
 * Filters by the selected day's city.
 */
export function ExperienceDrawer({
  isOpen,
  city,
  hosts,
  selectedHostId,
  selectedDayNumber,
  addedExperienceIds,
  bookedExperienceIds,
  onClose,
  onHostClick,
  onViewProfile,
  onFocusExperience,
  onAddExperience,
}: ExperienceDrawerProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      
      {/* Bottom Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 top-16 z-50 w-full rounded-t-2xl border border-[var(--border)] bg-[var(--background)]/95 backdrop-blur-md shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 duration-200"
        data-testid="experience-list-sheet"
      >
        <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
          <p className="text-sm text-[var(--muted-foreground)]">List View</p>
          <h2 className="text-base font-semibold text-[var(--foreground)]">
            Local Hosts in {city}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--muted)] rounded-lg transition-colors text-sm"
          >
            Close
          </button>
        </div>

        <div className="flex-1 min-h-0 p-3">
          <HostPanel
            variant="sheet"
            hosts={hosts}
            selectedHostId={selectedHostId}
            selectedDayNumber={selectedDayNumber}
            addedExperienceIds={addedExperienceIds}
            bookedExperienceIds={bookedExperienceIds}
            onHostClick={onHostClick}
            onFocusExperience={(host, experience) => onFocusExperience(host, experience)}
            onViewProfile={onViewProfile}
            onAddExperience={(host, experience) => onAddExperience(host, experience)}
          />
        </div>
      </div>
    </>
  );
}
