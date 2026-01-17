'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui';
import { SignInButton, AuthButton, UserMenu } from '@/components/features';

export function Navbar() {
  const { data: session, status } = useSession();
  const isLoading = status === 'loading';

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[var(--background)]/80 backdrop-blur-md border-b border-[var(--border)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🏠</span>
            <span className="font-bold text-xl text-[var(--foreground)]">Localhost</span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="/how-it-works" className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
              How It Works
            </Link>
            <Link href="/host" className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
              Become a Host
            </Link>
          </div>

          {/* Auth Buttons / User Menu */}
          <div className="flex items-center gap-3">
            {isLoading ? (
              <div className="w-20 h-8 bg-[var(--sand-beige)] rounded animate-pulse" />
            ) : session?.user ? (
              <UserMenu />
            ) : (
              <>
                <SignInButton />
                <AuthButton />
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
