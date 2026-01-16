'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/features';
import { Button } from '@/components/ui';
import { formatDate, formatPrice } from '@/lib/utils';

// Mock experience data
const MOCK_EXPERIENCES: Record<string, {
  id: string;
  title: string;
  city: string;
  country: string;
  duration: number;
  price: number;
  currency: string;
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
    photos: ['https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&h=600&fit=crop'],
    host: { name: 'Yuki Tanaka', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop' },
  },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function BookingSuccessPage({ params }: PageProps) {
  const searchParams = useSearchParams();
  const [experienceId, setExperienceId] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    params.then(p => setExperienceId(p.id));
    
    // Hide confetti after animation
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, [params]);

  const selectedDate = searchParams.get('date') || '';
  const guestCount = parseInt(searchParams.get('guests') || '1', 10);

  const experience = experienceId ? MOCK_EXPERIENCES[experienceId] : null;

  if (!experience) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <Navbar />
        <main className="pt-24 px-4">
          <div className="max-w-xl mx-auto text-center">
            <h1 className="text-2xl font-bold mb-4">Booking not found</h1>
            <Link href="/explore" className="text-[var(--sunset-orange)] hover:underline">
              Browse experiences
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const bookingId = `BK${Date.now().toString(36).toUpperCase()}`;
  const subtotal = experience.price * guestCount;
  const serviceFee = Math.round(subtotal * 0.1);
  const total = subtotal + serviceFee;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      {/* Confetti Animation */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-20px',
                animationDelay: `${Math.random() * 2}s`,
                backgroundColor: ['#E07A5F', '#F4A261', '#2A9D8F', '#264653', '#E9C46A'][Math.floor(Math.random() * 5)],
                width: '10px',
                height: '10px',
                borderRadius: Math.random() > 0.5 ? '50%' : '0',
              }}
            />
          ))}
        </div>
      )}

      <main className="pt-24 pb-12">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          {/* Success Message */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-6">
              <svg className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">
              Booking Confirmed! 🎉
            </h1>
            <p className="text-[var(--muted-foreground)]">
              Your experience is booked. We've sent a confirmation to your email.
            </p>
          </div>

          {/* Booking Details Card */}
          <div className="bg-white rounded-xl shadow-lg border border-[var(--border)] overflow-hidden mb-6">
            {/* Experience Image */}
            <div className="relative h-48">
              <img
                src={experience.photos[0]}
                alt={experience.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <h2 className="text-xl font-bold text-white">{experience.title}</h2>
                <p className="text-white/80 text-sm">
                  {experience.city}, {experience.country}
                </p>
              </div>
            </div>

            {/* Booking Info */}
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center pb-4 border-b border-[var(--border)]">
                <span className="text-[var(--muted-foreground)]">Confirmation #</span>
                <span className="font-mono font-medium text-[var(--foreground)]">{bookingId}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">Date</p>
                  <p className="font-medium text-[var(--foreground)]">{formatDate(selectedDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">Guests</p>
                  <p className="font-medium text-[var(--foreground)]">
                    {guestCount} {guestCount === 1 ? 'guest' : 'guests'}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border)]">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-[var(--foreground)]">Total Paid</span>
                  <span className="text-xl font-bold text-[var(--foreground)]">
                    {formatPrice(total, experience.currency)}
                  </span>
                </div>
              </div>

              {/* Host Contact */}
              <div className="flex items-center gap-3 pt-4 border-t border-[var(--border)]">
                {experience.host.image ? (
                  <img
                    src={experience.host.image}
                    alt={experience.host.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[var(--sunset-orange)] text-white flex items-center justify-center font-medium text-lg">
                    {experience.host.name?.[0] || '?'}
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-sm text-[var(--muted-foreground)]">Your host</p>
                  <p className="font-medium text-[var(--foreground)]">{experience.host.name}</p>
                </div>
                <Button variant="outline" size="sm">
                  Message
                </Button>
              </div>
            </div>
          </div>

          {/* What's Next */}
          <div className="bg-[var(--sand-beige-light)] rounded-xl p-6 mb-6">
            <h3 className="font-semibold text-[var(--foreground)] mb-4">What's next?</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[var(--sunset-orange)] text-white flex items-center justify-center text-sm flex-shrink-0">
                  1
                </div>
                <div>
                  <p className="font-medium text-[var(--foreground)]">Check your email</p>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    We've sent confirmation details and receipt to your inbox
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[var(--sunset-orange)] text-white flex items-center justify-center text-sm flex-shrink-0">
                  2
                </div>
                <div>
                  <p className="font-medium text-[var(--foreground)]">Get the meeting details</p>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Your host will share the exact address 24 hours before
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[var(--sunset-orange)] text-white flex items-center justify-center text-sm flex-shrink-0">
                  3
                </div>
                <div>
                  <p className="font-medium text-[var(--foreground)]">Enjoy your experience!</p>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Arrive on time and get ready for an authentic local adventure
                  </p>
                </div>
              </li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/explore" className="flex-1">
              <Button variant="outline" className="w-full">
                Browse more experiences
              </Button>
            </Link>
            <Link href={`/experience/${experienceId}`} className="flex-1">
              <Button variant="primary" className="w-full">
                View booking details
              </Button>
            </Link>
          </div>
        </div>
      </main>

      {/* Confetti Animation Styles */}
      <style jsx>{`
        @keyframes confetti {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti 3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
