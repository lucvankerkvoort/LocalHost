'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';

// Map database enum to display values
const VERIFICATION_DISPLAY: Record<string, { label: string; color: string }> = {
  BASIC: { label: 'Basic', color: 'bg-gray-100 text-gray-700' },
  VERIFIED: { label: 'Verified', color: 'bg-blue-100 text-blue-700' },
  TRUSTED: { label: 'Trusted Host', color: 'bg-green-100 text-green-700' },
};

interface HostProfileCardProps {
  id: string;
  name: string | null;
  image: string | null;
  bio: string | null;
  city: string | null;
  country: string | null;
  languages: string[];
  verificationTier: string;
  trustScore: number;
  experienceCount?: number;
  reviewCount?: number;
  memberSince?: Date;
}

export function HostProfileCard({
  id,
  name,
  image,
  bio,
  city,
  country,
  languages,
  verificationTier,
  trustScore,
  experienceCount = 0,
  reviewCount = 0,
  memberSince,
}: HostProfileCardProps) {
  const verification = VERIFICATION_DISPLAY[verificationTier] || VERIFICATION_DISPLAY.BASIC;
  const initials = name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  const joinYear = memberSince ? new Date(memberSince).getFullYear() : new Date().getFullYear();

  return (
    <div className="bg-white rounded-xl shadow-md border border-[var(--border)] p-6">
      <div className="flex items-start gap-4 mb-4">
        {/* Avatar */}
        <div className="relative">
          {image ? (
            <img
              src={image}
              alt={name || 'Host'}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center text-xl font-semibold">
              {initials}
            </div>
          )}
          {/* Verified badge */}
          {verificationTier !== 'BASIC' && (
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[var(--secondary)] text-[var(--secondary-foreground)] rounded-full flex items-center justify-center">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1">
          <h3 className="font-semibold text-lg text-[var(--foreground)]">
            Hosted by {name}
          </h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            {city && country ? `${city}, ${country}` : 'Location not specified'}
          </p>
          <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${verification.color}`}>
            {verification.label}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 py-4 border-y border-[var(--border)] mb-4">
        <div className="text-center">
          <div className="font-semibold text-[var(--foreground)]">{reviewCount}</div>
          <div className="text-xs text-[var(--muted-foreground)]">Reviews</div>
        </div>
        <div className="text-center">
          <div className="font-semibold text-[var(--foreground)]">{trustScore}%</div>
          <div className="text-xs text-[var(--muted-foreground)]">Trust Score</div>
        </div>
        <div className="text-center">
          <div className="font-semibold text-[var(--foreground)]">{joinYear}</div>
          <div className="text-xs text-[var(--muted-foreground)]">Joined</div>
        </div>
      </div>

      {/* Bio */}
      {bio && (
        <p className="text-sm text-[var(--foreground)] mb-4 line-clamp-3">
          {bio}
        </p>
      )}

      {/* Languages */}
      {languages.length > 0 && (
        <div className="mb-4">
          <span className="text-sm text-[var(--muted-foreground)]">Languages: </span>
          <span className="text-sm text-[var(--foreground)]">{languages.join(', ')}</span>
        </div>
      )}

      {/* Contact Button */}
      <Link href={`/host/${id}`}>
        <Button variant="outline" className="w-full">
          View Profile
        </Button>
      </Link>
    </div>
  );
}
