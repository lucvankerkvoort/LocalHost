'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar, PaymentForm, BookingSummary } from '@/components/features';
import { formatDate } from '@/lib/utils';

// Mock experience data (same as detail page)
const MOCK_EXPERIENCES: Record<string, {
  id: string;
  title: string;
  city: string;
  country: string;
  duration: number;
  price: number;
  currency: string;
  rating: number;
  reviewCount: number;
  photos: string[];
  host: { name: string; image: string | null };
}> = {
  '1': {
    id: '1',
    title: 'Sunset Cooking Class with Nonna Maria',
    city: 'Rome',
    country: 'Italy',
    duration: 180,
    price: 7500,
    currency: 'USD',
    rating: 4.9,
    reviewCount: 127,
    photos: ['https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&h=600&fit=crop'],
    host: { name: 'Maria Rossi', image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop' },
  },
  '2': {
    id: '2',
    title: 'Hidden Murals Walking Tour',
    city: 'Mexico City',
    country: 'Mexico',
    duration: 150,
    price: 3500,
    currency: 'USD',
    rating: 4.8,
    reviewCount: 89,
    photos: ['https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=800&h=600&fit=crop'],
    host: { name: 'Carlos Mendez', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop' },
  },
  '3': {
    id: '3',
    title: 'Mountain Sunrise Hike & Breakfast',
    city: 'Kyoto',
    country: 'Japan',
    duration: 240,
    price: 5000,
    currency: 'USD',
    rating: 5.0,
    reviewCount: 64,
    photos: ['https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&h=600&fit=crop'],
    host: { name: 'Yuki Tanaka', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop' },
  },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function BookingPage({ params }: PageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [experienceId, setExperienceId] = useState<string | null>(null);

  // Get params
  useEffect(() => {
    params.then(p => setExperienceId(p.id));
  }, [params]);

  const selectedDate = searchParams.get('date') || '';
  const guestCount = parseInt(searchParams.get('guests') || '1', 10);

  // Get experience data
  const experience = experienceId ? MOCK_EXPERIENCES[experienceId] : null;

  if (!experienceId || !experience) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <Navbar />
        <main className="pt-24 px-4">
          <div className="max-w-xl mx-auto text-center">
            <h1 className="text-2xl font-bold mb-4">Experience not found</h1>
            <Link href="/explore" className="text-[var(--sunset-orange)] hover:underline">
              Browse experiences
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!selectedDate) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <Navbar />
        <main className="pt-24 px-4">
          <div className="max-w-xl mx-auto text-center">
            <h1 className="text-2xl font-bold mb-4">Missing booking details</h1>
            <p className="text-[var(--muted-foreground)] mb-4">
              Please select a date and number of guests to continue.
            </p>
            <Link
              href={`/experience/${experienceId}`}
              className="text-[var(--sunset-orange)] hover:underline"
            >
              Back to experience
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const handlePaymentSubmit = async () => {
    // Simulate booking creation
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // Redirect to success page
    router.push(
      `/booking/${experienceId}/success?date=${selectedDate}&guests=${guestCount}`
    );
  };

  const handleCancel = () => {
    router.push(`/experience/${experienceId}`);
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      <main className="pt-24 pb-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <Link
              href={`/experience/${experienceId}`}
              className="inline-flex items-center gap-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors mb-4"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to experience
            </Link>
            <h1 className="text-3xl font-bold text-[var(--foreground)]">
              Complete your booking
            </h1>
            <p className="text-[var(--muted-foreground)] mt-2">
              You're booking for {formatDate(selectedDate)} with {guestCount} {guestCount === 1 ? 'guest' : 'guests'}
            </p>
          </div>

          {/* Content */}
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left - Payment Form */}
            <div className="flex-1">
              <PaymentForm
                totalAmount={experience.price * guestCount + Math.round(experience.price * guestCount * 0.1)}
                currency={experience.currency}
                onSubmit={handlePaymentSubmit}
                onCancel={handleCancel}
              />

              {/* Terms */}
              <p className="text-sm text-[var(--muted-foreground)] mt-4">
                By clicking "Pay", you agree to our{' '}
                <a href="#" className="text-[var(--sunset-orange)] hover:underline">Terms of Service</a>
                {' '}and{' '}
                <a href="#" className="text-[var(--sunset-orange)] hover:underline">Cancellation Policy</a>.
              </p>
            </div>

            {/* Right - Booking Summary */}
            <div className="lg:w-96">
              <BookingSummary
                experience={{
                  ...experience,
                  image: experience.photos[0],
                }}
                selectedDate={selectedDate}
                guestCount={guestCount}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
