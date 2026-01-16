'use client';

import { formatPrice, formatDate, formatDuration, formatGroupSize } from '@/lib/utils';

interface BookingSummaryProps {
  experience: {
    title: string;
    image: string;
    city: string;
    country: string;
    duration: number;
    price: number;
    currency: string;
    rating: number;
    reviewCount: number;
    host: {
      name: string;
      image: string | null;
    };
  };
  selectedDate: string;
  guestCount: number;
}

export function BookingSummary({ experience, selectedDate, guestCount }: BookingSummaryProps) {
  const subtotal = experience.price * guestCount;
  const serviceFee = Math.round(subtotal * 0.1); // 10% service fee
  const total = subtotal + serviceFee;

  return (
    <div className="bg-white rounded-xl shadow-lg border border-[var(--border)] p-6">
      {/* Experience Preview */}
      <div className="flex gap-4 pb-4 border-b border-[var(--border)]">
        <img
          src={experience.image}
          alt={experience.title}
          className="w-24 h-24 rounded-lg object-cover flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[var(--foreground)] line-clamp-2 mb-1">
            {experience.title}
          </h3>
          <p className="text-sm text-[var(--muted-foreground)] mb-2">
            {experience.city}, {experience.country}
          </p>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-[var(--sunset-orange)]">★</span>
            <span className="font-medium">{experience.rating}</span>
            <span className="text-[var(--muted-foreground)]">({experience.reviewCount})</span>
          </div>
        </div>
      </div>

      {/* Booking Details */}
      <div className="py-4 border-b border-[var(--border)] space-y-3">
        <div className="flex justify-between">
          <span className="text-[var(--muted-foreground)]">Date</span>
          <span className="font-medium text-[var(--foreground)]">{formatDate(selectedDate)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted-foreground)]">Guests</span>
          <span className="font-medium text-[var(--foreground)]">
            {guestCount} {guestCount === 1 ? 'guest' : 'guests'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted-foreground)]">Duration</span>
          <span className="font-medium text-[var(--foreground)]">{formatDuration(experience.duration)}</span>
        </div>
      </div>

      {/* Price Breakdown */}
      <div className="py-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-[var(--muted-foreground)]">
            {formatPrice(experience.price, experience.currency)} × {guestCount} guests
          </span>
          <span className="text-[var(--foreground)]">{formatPrice(subtotal, experience.currency)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--muted-foreground)]">Service fee</span>
          <span className="text-[var(--foreground)]">{formatPrice(serviceFee, experience.currency)}</span>
        </div>
        <div className="flex justify-between font-semibold text-lg pt-2 border-t border-[var(--border)]">
          <span>Total</span>
          <span>{formatPrice(total, experience.currency)}</span>
        </div>
      </div>

      {/* Host Info */}
      <div className="flex items-center gap-3 pt-4 border-t border-[var(--border)]">
        {experience.host.image ? (
          <img
            src={experience.host.image}
            alt={experience.host.name}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-[var(--sunset-orange)] text-white flex items-center justify-center font-medium">
            {experience.host.name?.[0] || '?'}
          </div>
        )}
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">Hosted by</p>
          <p className="font-medium text-[var(--foreground)]">{experience.host.name}</p>
        </div>
      </div>

      {/* Cancellation Policy */}
      <div className="mt-4 p-3 bg-[var(--sand-beige-light)] rounded-lg">
        <p className="text-sm text-[var(--foreground)]">
          <strong>Free cancellation</strong> up to 48 hours before the experience
        </p>
      </div>
    </div>
  );
}
