'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { SignInButton, AuthButton, UserMenu } from '@/components/features';
import { P2PChatPanel } from '@/components/features/p2p-chat-panel';

import { Home, MessageSquare } from 'lucide-react';

import { useAppSelector } from '@/store/hooks';
import { selectTotalUnreadCount } from '@/store/p2p-chat-slice';

export function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const isLoading = status === 'loading';


  // P2P Chat Panel state
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  const unreadCount = useAppSelector(selectTotalUnreadCount);

  return (
    <>
      <nav data-testid="navbar" className="fixed top-0 left-0 right-0 z-50 bg-[var(--background)]/80 backdrop-blur-md border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 group">
              <Home className="w-6 h-6 text-[var(--princeton-orange)] group-hover:text-[var(--foreground)] transition-colors" />
              <span className="font-bold text-xl text-[var(--foreground)]">Localhost</span>
            </Link>

            {/* Right Side Actions */}
            <div className="flex items-center gap-3">
              {/* P2P Chat Button */}
              <button
                data-testid="chat-toggle"
                onClick={() => setIsChatOpen(true)}
                className="relative p-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
                title="Messages"
              >
                <MessageSquare className="w-6 h-6 text-[var(--foreground)]" />
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


            </div>
          </div>
        </div>

      </nav>

      {/* P2P Chat Panel */}
      <P2PChatPanel 
        isOpen={isChatOpen} 
        onClose={() => setIsChatOpen(false)} 
      />
    </>
  );
}
