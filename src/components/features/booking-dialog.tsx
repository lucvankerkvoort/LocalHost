'use client';

import { useState } from 'react';
import Image from 'next/image';

// Type for candidate with embedded experience and host from API
interface BookingCandidateWithData {
  id: string;
  hostId: string;
  experienceId: string;
  dayNumber?: number;
  date?: string | null;
  timeSlot?: string | null;
  experience: {
    id: string;
    title: string;
    price: number;
    duration: number;
    rating?: number;
    reviewCount?: number;
    photos?: string[];
  };
  host: {
    id: string;
    name: string;
    image?: string | null;
  };
}

interface BookingDialogProps {
  candidate: BookingCandidateWithData;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (candidateId: string) => Promise<void>;
}

export function BookingDialog({
  candidate,
  isOpen,
  onClose,
  onConfirm,
}: BookingDialogProps) {
  const [isBooking, setIsBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use embedded data from API response
  const experience = candidate.experience;
  const host = candidate.host;

  const handleConfirm = async () => {
    setIsBooking(true);
    setError(null);
    
    try {
      await onConfirm(candidate.id);
      onClose();
    } catch (e) {
      setError('Failed to complete booking. Please try again.');
    } finally {
      setIsBooking(false);
    }
  };

  if (!isOpen || !experience || !host) return null;

  const formatDate = (date: string | null | undefined) => {
    if (!date) return 'Date to be confirmed';
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  const timeSlotLabels: Record<string, string> = {
    morning: 'Morning (9am - 12pm)',
    afternoon: 'Afternoon (1pm - 5pm)',
    evening: 'Evening (6pm - 9pm)',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[var(--border)]">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">
            Confirm Booking
          </h2>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Day {candidate.dayNumber} of your trip
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Experience info */}
          <div className="flex gap-4 mb-6">
            <Image
              src={experience.photos?.[0] || host.image || '/placeholder-host.jpg'}
              alt={experience.title}
              width={80}
              height={80}
              className="rounded-xl object-cover"
            />
            <div className="flex-1">
              <h3 className="font-semibold text-[var(--foreground)]">{experience.title}</h3>
              <p className="text-sm text-[var(--muted-foreground)]">with {host.name}</p>
              <div className="flex items-center gap-2 mt-2 text-sm">
                <span className="text-amber-500">★ {experience.rating}</span>
                <span className="text-[var(--muted-foreground)]">
                  ({experience.reviewCount} reviews)
                </span>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Date</span>
              <span className="font-medium">{formatDate(candidate.date)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Time</span>
              <span className="font-medium">
                {candidate.timeSlot ? timeSlotLabels[candidate.timeSlot] : 'To be confirmed'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Duration</span>
              <span className="font-medium">{Math.round(experience.duration / 60)} hours</span>
            </div>
            <div className="flex justify-between text-sm pt-3 border-t border-[var(--border)]">
              <span className="font-semibold">Total</span>
              <span className="font-semibold text-lg">${(experience.price / 100).toFixed(0)}</span>
            </div>
          </div>

          {/* Chat unlock notice */}
          <div className="bg-[var(--blue-green)]/10 rounded-xl p-4 mb-6">
            <div className="flex gap-3">
              <span className="text-2xl">💬</span>
              <div>
                <p className="font-medium text-[var(--foreground)] text-sm">
                  Chat unlocks after booking
                </p>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  Once booked, you'll be able to fully chat with {host.name.split(' ')[0]} to shape the experience together.
                </p>
              </div>
            </div>
          </div>

          {/* Cancellation policy */}
          <p className="text-xs text-[var(--muted-foreground)] text-center mb-4">
            Free cancellation up to 24 hours before the experience
          </p>

          {error && (
            <p className="text-sm text-red-500 text-center mb-4">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isBooking}
              className="flex-1 px-4 py-3 border border-[var(--border)] text-[var(--foreground)] rounded-xl font-medium hover:bg-[var(--background)] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isBooking}
              className="flex-1 px-4 py-3 bg-[var(--princeton-orange)] text-white rounded-xl font-medium hover:bg-[var(--princeton-orange)]/90 transition-colors disabled:opacity-50"
            >
              {isBooking ? 'Booking...' : `Confirm $${(experience.price / 100).toFixed(0)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
