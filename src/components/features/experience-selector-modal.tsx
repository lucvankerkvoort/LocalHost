'use client';

import { useState } from 'react';
import Image from 'next/image';

import { HOSTS, type Host, type HostExperience } from '@/lib/data/hosts';
import { CATEGORY_ICONS, CATEGORY_LABELS, type ExperienceCategory } from '@/types';

interface ExperienceSelectorModalProps {
  hostId: string;
  dayNumber: number;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (experience: HostExperience, timeSlot: string) => void;
}

const TIME_SLOTS = [
  { value: 'morning', label: '🌅 Morning', time: '9am - 12pm' },
  { value: 'afternoon', label: '☀️ Afternoon', time: '1pm - 5pm' },
  { value: 'evening', label: '🌙 Evening', time: '6pm - 9pm' },
];

export function ExperienceSelectorModal({
  hostId,
  dayNumber,
  isOpen,
  onClose,
  onSelect,
}: ExperienceSelectorModalProps) {
  const [selectedExperience, setSelectedExperience] = useState<HostExperience | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('afternoon');

  const host = HOSTS.find(h => h.id === hostId);

  if (!isOpen || !host) return null;

  const handleConfirm = () => {
    if (selectedExperience) {
      onSelect(selectedExperience, selectedTimeSlot);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center gap-4">
          <Image
            src={host.photo}
            alt={host.name}
            width={48}
            height={48}
            className="rounded-full"
          />
          <div className="flex-1">
            <h2 className="font-semibold text-[var(--foreground)]">
              Add to Day {dayNumber}
            </h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              Choose an experience with {host.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Experience list */}
        <div className="p-4 overflow-y-auto max-h-[40vh] space-y-3">
          {host.experiences.map((exp) => {
            const isSelected = selectedExperience?.id === exp.id;
            const categoryIcon = CATEGORY_ICONS[exp.category as ExperienceCategory] || '✨';
            
            return (
              <button
                key={exp.id}
                onClick={() => setSelectedExperience(exp)}
                className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                  isSelected
                    ? 'border-[var(--princeton-orange)] bg-[var(--princeton-orange)]/5'
                    : 'border-[var(--border)] hover:border-[var(--blue-green)]'
                }`}
              >
                <div className="flex gap-3">
                  <Image
                    src={exp.photo || host.photo}
                    alt={exp.title}
                    width={64}
                    height={64}
                    className="rounded-lg object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{categoryIcon}</span>
                      <h3 className="font-medium text-[var(--foreground)] truncate">
                        {exp.title}
                      </h3>
                    </div>
                    <p className="text-sm text-[var(--muted-foreground)] line-clamp-2 mt-1">
                      {exp.description}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-sm text-[var(--muted-foreground)]">
                      <span>⏱ {Math.round(exp.duration / 60)}h</span>
                      <span className="text-amber-500">★ {exp.rating}</span>
                      <span className="ml-auto font-semibold text-[var(--foreground)]">
                        ${(exp.price / 100).toFixed(0)}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Time slot selector */}
        {selectedExperience && (
          <div className="px-6 py-4 bg-[var(--background)] border-t border-[var(--border)]">
            <p className="text-sm font-medium text-[var(--foreground)] mb-3">
              Preferred time
            </p>
            <div className="flex gap-2">
              {TIME_SLOTS.map((slot) => (
                <button
                  key={slot.value}
                  onClick={() => setSelectedTimeSlot(slot.value)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedTimeSlot === slot.value
                      ? 'bg-[var(--blue-green)] text-white'
                      : 'bg-white border border-[var(--border)] text-[var(--foreground)] hover:border-[var(--blue-green)]'
                  }`}
                >
                  <span className="block">{slot.label}</span>
                  <span className="block text-xs opacity-70">{slot.time}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border)] flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-[var(--border)] text-[var(--foreground)] rounded-xl font-medium hover:bg-[var(--background)]"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedExperience}
            className="flex-1 px-4 py-3 bg-[var(--princeton-orange)] text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--princeton-orange)]/90"
          >
            Add to Day {dayNumber}
          </button>
        </div>
      </div>
    </div>
  );
}
