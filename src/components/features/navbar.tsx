'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { SignInButton, AuthButton, UserMenu } from '@/components/features';
import { P2PChatPanel } from '@/components/features/p2p-chat-panel';

export function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const isLoading = status === 'loading';
  const isBecomeHostPage = pathname === '/become-host';
  const ctaLink = isBecomeHostPage
    ? { href: '/', label: 'Plan a Trip' }
    : { href: '/become-host', label: 'Become a Host' };

  // P2P Chat Panel state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Mock unread count - in real app this would come from Redux/API
  const unreadCount = 1;

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[var(--background)]/80 backdrop-blur-md border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl">🏠</span>
              <span className="font-bold text-xl text-[var(--foreground)]">Localhost</span>
            </Link>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-8">
              <Link href="/explore" className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
                Explore
              </Link>
              <Link href="/trips" className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
                My Trips
              </Link>
              <Link href={ctaLink.href} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
                {ctaLink.label}
              </Link>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-3">
              {/* P2P Chat Button */}
              <button
                onClick={() => setIsChatOpen(true)}
                className="relative p-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
                title="Messages"
              >
                <svg 
                  className="w-6 h-6 text-[var(--foreground)]" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" 
                  />
                </svg>
                {/* Notification Badge */}
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[var(--princeton-orange)] text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Auth Buttons / User Menu */}
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

              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
                aria-label="Toggle menu"
              >
                <svg
                  className="w-6 h-6 text-[var(--foreground)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  {isMobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-[var(--border)] bg-[var(--background)] px-4 py-4 shadow-lg animate-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col space-y-4">
              <Link 
                href="/explore" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-lg font-medium text-[var(--foreground)] hover:text-[var(--princeton-orange)] transition-colors"
              >
                Explore
              </Link>
              <Link 
                href="/trips" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-lg font-medium text-[var(--foreground)] hover:text-[var(--princeton-orange)] transition-colors"
              >
                My Trips
              </Link>
              <Link 
                href={ctaLink.href} 
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-lg font-medium text-[var(--foreground)] hover:text-[var(--princeton-orange)] transition-colors"
              >
                {ctaLink.label}
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* P2P Chat Panel */}
      <P2PChatPanel 
        isOpen={isChatOpen} 
        onClose={() => setIsChatOpen(false)} 
      />
    </>
  );
}
