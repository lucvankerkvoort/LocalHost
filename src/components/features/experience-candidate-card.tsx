'use client';

import { useState } from 'react';
import Image from 'next/image';

import { HOSTS } from '@/lib/data/hosts';

// Status types (matching Prisma schema)
export type CandidateStatus = 
  | 'INTERESTED' 
  | 'AWAITING_REPLY' 
  | 'REPLIED' 
  | 'UNRESPONSIVE' 
  | 'BOOKED' 
  | 'CANCELLED';

export type PreliminaryChatStatus = 'OPEN' | 'CLOSED' | 'EXPIRED';

export interface ExperienceCandidateData {
  id: string;
  hostId: string;
  experienceId: string;
  dayNumber: number;
  date?: string | null;
  timeSlot?: string | null;
  status: CandidateStatus;
  preliminaryChat?: {
    status: PreliminaryChatStatus;
    userMessage?: string | null;
    hostReply?: string | null;
  } | null;
}

interface ExperienceCandidateCardProps {
  candidate: ExperienceCandidateData;
  onMessageHost: (candidate: ExperienceCandidateData) => void;
  onBook: (candidate: ExperienceCandidateData) => void;
  onOpenChat: (candidate: ExperienceCandidateData) => void;
  onRemove: (candidateId: string) => void;
}

const STATUS_BADGES: Record<CandidateStatus, { label: string; color: string }> = {
  INTERESTED: { label: 'Interested', color: 'bg-blue-100 text-blue-700' },
  AWAITING_REPLY: { label: 'Awaiting Reply', color: 'bg-amber-100 text-amber-700' },
  REPLIED: { label: 'Host Replied', color: 'bg-green-100 text-green-700' },
  UNRESPONSIVE: { label: 'No Response', color: 'bg-gray-100 text-gray-600' },
  BOOKED: { label: 'Booked', color: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-600' },
};

const TIME_SLOT_LABELS: Record<string, string> = {
  morning: '🌅 Morning',
  afternoon: '☀️ Afternoon',
  evening: '🌙 Evening',
};

export function ExperienceCandidateCard({
  candidate,
  onMessageHost,
  onBook,
  onOpenChat,
  onRemove,
}: ExperienceCandidateCardProps) {
  const [isRemoving, setIsRemoving] = useState(false);
  
  // Get host and experience data from static data
  const host = HOSTS.find(h => h.id === candidate.hostId);
  const experience = host?.experiences.find(e => e.id === candidate.experienceId);
  
  if (!host || !experience) {
    return null;
  }

  const statusBadge = STATUS_BADGES[candidate.status];
  const isBooked = candidate.status === 'BOOKED';
  const canMessage = candidate.status === 'INTERESTED';
  const canBook = ['INTERESTED', 'REPLIED', 'AWAITING_REPLY'].includes(candidate.status);

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await onRemove(candidate.id);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-[var(--border)] shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Header with host photo and status */}
      <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-[var(--blue-green)]/5 to-transparent">
        <div className="relative">
          <Image
            src={host.photo}
            alt={host.name}
            width={48}
            height={48}
            className="rounded-full object-cover border-2 border-white shadow-sm"
          />
          {isBooked && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs">✓</span>
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-[var(--foreground)] truncate">
              {host.name}
            </h4>
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge.color}`}>
              {statusBadge.label}
            </span>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] truncate">
            {experience.title}
          </p>
        </div>

        <button
          onClick={handleRemove}
          disabled={isRemoving || isBooked}
          className="text-[var(--muted-foreground)] hover:text-red-500 transition-colors disabled:opacity-50"
          title={isBooked ? 'Cannot remove booked experience' : 'Remove'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Experience details */}
      <div className="px-4 py-3 border-t border-[var(--border)]/50">
        <div className="flex items-center gap-4 text-sm text-[var(--muted-foreground)]">
          <span className="flex items-center gap-1">
            ⏱ {Math.round(experience.duration / 60)}h
          </span>
          {candidate.timeSlot && (
            <span>{TIME_SLOT_LABELS[candidate.timeSlot] || candidate.timeSlot}</span>
          )}
          <span className="ml-auto font-medium text-[var(--foreground)]">
            ${(experience.price / 100).toFixed(0)}
          </span>
        </div>
      </div>

      {/* Preliminary chat preview */}
      {candidate.preliminaryChat?.hostReply && (
        <div className="px-4 py-2 bg-green-50 border-t border-green-100">
          <p className="text-xs text-green-700 line-clamp-1">
            💬 "{candidate.preliminaryChat.hostReply}"
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="p-3 border-t border-[var(--border)] flex gap-2">
        {isBooked ? (
          <button
            onClick={() => onOpenChat(candidate)}
            className="flex-1 px-4 py-2 bg-[var(--blue-green)] text-white rounded-lg font-medium text-sm hover:bg-[var(--blue-green)]/90 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Chat with {host.name.split(' ')[0]}
          </button>
        ) : (
          <>
            {canMessage && !candidate.preliminaryChat && (
              <button
                onClick={() => onMessageHost(candidate)}
                className="flex-1 px-3 py-2 border border-[var(--border)] text-[var(--foreground)] rounded-lg font-medium text-sm hover:bg-[var(--background)] transition-colors"
              >
                Message Host
              </button>
            )}
            {canBook && (
              <button
                onClick={() => onBook(candidate)}
                className="flex-1 px-3 py-2 bg-[var(--princeton-orange)] text-white rounded-lg font-medium text-sm hover:bg-[var(--princeton-orange)]/90 transition-colors"
              >
                Book ${(experience.price / 100).toFixed(0)}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
