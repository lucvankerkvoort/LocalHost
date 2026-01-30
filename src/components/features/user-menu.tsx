'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

export function UserMenu() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!session?.user) return null;

  const initials = session.user.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 rounded-full hover:bg-[var(--sand-beige)] transition-colors"
      >
        {session.user.image ? (
          <img
            src={session.user.image}
            alt={session.user.name || 'User'}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-[var(--sunset-orange)] text-white flex items-center justify-center text-sm font-medium">
            {initials}
          </div>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-[var(--border)] py-2 animate-fade-in z-50">
          <div className="px-4 py-2 border-b border-[var(--border)]">
            <p className="font-medium text-[var(--foreground)] truncate">
              {session.user.name}
            </p>
            <p className="text-sm text-[var(--muted-foreground)] truncate">
              {session.user.email}
            </p>
          </div>

          <div className="py-1">
            <Link
              href="/profile"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--sand-beige)] transition-colors"
            >
              Your Profile
            </Link>
            <Link
              href="/trips"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--sand-beige)] transition-colors"
            >
              My Trips
            </Link>
            <Link
              href="/bookings"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--sand-beige)] transition-colors"
            >
              Your Bookings
            </Link>
            <Link
              href="/host/dashboard"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--sand-beige)] transition-colors"
            >
              Host Dashboard
            </Link>
          </div>

          <div className="border-t border-[var(--border)] pt-1">
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="w-full text-left px-4 py-2 text-sm text-[var(--destructive)] hover:bg-red-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
