'use client';

import { ExternalLink, X, Hotel } from 'lucide-react';

export interface AccommodationLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
  city: string;
  checkin: string;   // YYYY-MM-DD
  checkout: string;  // YYYY-MM-DD
  numAdults: number;
  lodgingTitle?: string;
}

function buildBookingUrl(city: string, checkin: string, checkout: string, numAdults: number): string {
  const params = new URLSearchParams({
    ss: city,
    no_rooms: '1',
    group_adults: String(numAdults),
  });
  if (checkin) params.set('checkin', checkin);
  if (checkout) params.set('checkout', checkout);
  return `https://www.booking.com/search.html?${params.toString()}`;
}

function buildAirbnbUrl(city: string, checkin: string, checkout: string, numAdults: number): string {
  const encoded = encodeURIComponent(city);
  const params = new URLSearchParams({ adults: String(numAdults) });
  if (checkin) params.set('checkin', checkin);
  if (checkout) params.set('checkout', checkout);
  return `https://www.airbnb.com/s/${encoded}/homes?${params.toString()}`;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function AccommodationLinksModal({
  isOpen,
  onClose,
  city,
  checkin,
  checkout,
  numAdults,
  lodgingTitle,
}: AccommodationLinksModalProps) {
  if (!isOpen) return null;

  const bookingUrl = buildBookingUrl(city, checkin, checkout, numAdults);
  const airbnbUrl = buildAirbnbUrl(city, checkin, checkout, numAdults);
  const dateRange = checkin && checkout
    ? `${formatDate(checkin)} → ${formatDate(checkout)}`
    : checkin
      ? `From ${formatDate(checkin)}`
      : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal */}
      <div
        className="relative w-full max-w-sm bg-[var(--background)] rounded-2xl shadow-xl border border-[var(--border)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-[var(--deep-space-blue)]/10 flex items-center justify-center flex-shrink-0">
            <Hotel className="w-5 h-5 text-[var(--deep-space-blue)]" />
          </div>
          <div>
            <h2 className="font-semibold text-[var(--foreground)] text-base leading-tight">
              {lodgingTitle ? lodgingTitle : `Stay in ${city}`}
            </h2>
            {city && !lodgingTitle && (
              <p className="text-xs text-[var(--muted-foreground)]">{city}</p>
            )}
          </div>
        </div>

        {/* Date / guest meta */}
        {(dateRange || numAdults) && (
          <p className="mt-3 text-xs text-[var(--muted-foreground)] bg-[var(--muted)] rounded-lg px-3 py-2">
            {dateRange && <span>{dateRange}</span>}
            {dateRange && numAdults && <span className="mx-1.5">·</span>}
            {numAdults && <span>{numAdults} guest{numAdults !== 1 ? 's' : ''}</span>}
          </p>
        )}

        {/* Links */}
        <div className="mt-4 flex flex-col gap-3">
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="booking-com-link"
            className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#003580] text-white text-sm font-medium hover:bg-[#003580]/90 transition-colors"
          >
            <span>Search on Booking.com</span>
            <ExternalLink className="w-4 h-4 opacity-70" />
          </a>

          <a
            href={airbnbUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="airbnb-link"
            className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#FF5A5F] text-white text-sm font-medium hover:bg-[#FF5A5F]/90 transition-colors"
          >
            <span>Search on Airbnb</span>
            <ExternalLink className="w-4 h-4 opacity-70" />
          </a>
        </div>

        <p className="mt-4 text-[10px] text-center text-[var(--muted-foreground)]">
          Opens in a new tab. We are not affiliated with these services.
        </p>
      </div>
    </div>
  );
}
