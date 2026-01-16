'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { formatPrice, formatDate } from '@/lib/utils';

interface BookingWidgetProps {
  experienceId: string;
  price: number;
  currency: string;
  minGroupSize: number;
  maxGroupSize: number;
  rating: number;
  reviewCount: number;
}

export function BookingWidget({
  experienceId,
  price,
  currency,
  minGroupSize,
  maxGroupSize,
  rating,
  reviewCount,
}: BookingWidgetProps) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [guestCount, setGuestCount] = useState(minGroupSize);
  const [isLoading, setIsLoading] = useState(false);

  // Generate next 14 days as available dates (mock)
  const availableDates = Array.from({ length: 14 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i + 1);
    return date.toISOString().split('T')[0];
  });

  const totalPrice = price * guestCount;

  const handleBooking = () => {
    setIsLoading(true);
    // Navigate to booking checkout page
    router.push(`/booking/${experienceId}?date=${selectedDate}&guests=${guestCount}`);
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-[var(--border)] p-6 sticky top-24">
      {/* Price and Rating */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <span className="text-2xl font-bold text-[var(--foreground)]">
            {formatPrice(price, currency)}
          </span>
          <span className="text-[var(--muted-foreground)]"> / person</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[var(--sunset-orange)]">★</span>
          <span className="font-medium">{rating.toFixed(1)}</span>
          <span className="text-[var(--muted-foreground)]">({reviewCount})</span>
        </div>
      </div>

      {/* Date Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
          Select Date
        </label>
        <select
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--sunset-orange)] transition-colors"
        >
          <option value="">Choose a date</option>
          {availableDates.map((date) => (
            <option key={date} value={date}>
              {formatDate(date)}
            </option>
          ))}
        </select>
      </div>

      {/* Guest Count */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
          Number of Guests
        </label>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setGuestCount(Math.max(minGroupSize, guestCount - 1))}
            disabled={guestCount <= minGroupSize}
            className="w-10 h-10 rounded-full border border-[var(--border)] flex items-center justify-center hover:bg-[var(--sand-beige)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <span className="text-xl font-semibold w-12 text-center">{guestCount}</span>
          <button
            onClick={() => setGuestCount(Math.min(maxGroupSize, guestCount + 1))}
            disabled={guestCount >= maxGroupSize}
            className="w-10 h-10 rounded-full border border-[var(--border)] flex items-center justify-center hover:bg-[var(--sand-beige)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          {minGroupSize === maxGroupSize
            ? `${minGroupSize} guests required`
            : `${minGroupSize}-${maxGroupSize} guests allowed`}
        </p>
      </div>

      {/* Price Breakdown */}
      <div className="border-t border-[var(--border)] pt-4 mb-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-[var(--muted-foreground)]">
            {formatPrice(price, currency)} × {guestCount} guests
          </span>
          <span>{formatPrice(totalPrice, currency)}</span>
        </div>
        <div className="flex justify-between font-semibold text-lg">
          <span>Total</span>
          <span>{formatPrice(totalPrice, currency)}</span>
        </div>
      </div>

      {/* Book Button */}
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        disabled={!selectedDate || isLoading}
        isLoading={isLoading}
        onClick={handleBooking}
      >
        Reserve
      </Button>

      <p className="text-center text-sm text-[var(--muted-foreground)] mt-3">
        You won't be charged yet
      </p>
    </div>
  );
}
