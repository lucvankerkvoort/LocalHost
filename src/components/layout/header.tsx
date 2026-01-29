'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setP2PChatOpen } from '@/store/ui-slice';

interface HeaderProps {
  onToggleTimeline?: () => void;
  showTimeline?: boolean;
}

export function Header({ onToggleTimeline, showTimeline }: HeaderProps) {
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const isP2PChatOpen = useAppSelector((state) => state.ui.isP2PChatOpen);
  
  const isBecomeHost = pathname === '/become-host';
  const isProfile = pathname?.startsWith('/profile');
  
  // TODO: Get from Redux
  const unreadMessageCount = 1; 

  return (
    <header className="flex-shrink-0 bg-[var(--background)]/95 backdrop-blur-md border-b border-[var(--border)] px-4 py-3 z-20 relative">
      <div className="flex items-center justify-between max-w-7xl mx-auto w-full">
        {/* Logo / Brand */}
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="relative w-8 h-8">
            <Image 
              src="/logo.png" 
              alt="Localhost Logo" 
              fill
              className="object-contain"
            />
          </div>
          <h1 className="font-bold text-xl text-[var(--foreground)]">Localhost</h1>
        </Link>
        
        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Mode Switcher */}
          <div className="flex bg-[var(--card)] rounded-lg p-1 border border-[var(--border)]">
            <Link
              href="/"
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-all ${
                !isBecomeHost && !isProfile 
                  ? 'bg-[var(--foreground)] text-[var(--background)] shadow-sm' 
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              Plan Trip
            </Link>
            <Link
              href="/become-host"
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-all ${
                isBecomeHost 
                  ? 'bg-[var(--foreground)] text-[var(--background)] shadow-sm' 
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              Become Host
            </Link>
          </div>
          
          {/* Contextual Actions */}
          {!isBecomeHost && !isProfile && onToggleTimeline && (
            <button
              onClick={onToggleTimeline}
              className="px-3 py-1.5 text-sm rounded-lg bg-[var(--sky-blue-lighter)]/30 text-[var(--foreground)] hover:bg-[var(--sky-blue-lighter)]/50 transition-colors hidden sm:block"
            >
              {showTimeline ? 'Hide' : 'Show'} Timeline
            </button>
          )}

          {/* P2P Chat Button */}
          <button
            onClick={() => dispatch(setP2PChatOpen(!isP2PChatOpen))}
            className={`relative p-2 rounded-lg transition-colors cursor-pointer ${
              isP2PChatOpen 
                ? 'bg-[var(--sky-blue-lighter)]/50 text-[var(--foreground)]' 
                : 'bg-[var(--sky-blue-lighter)]/30 hover:bg-[var(--sky-blue-lighter)]/50 text-[var(--foreground)]'
            }`}
            title="Messages"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {unreadMessageCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--princeton-orange)] text-white text-xs font-bold rounded-full flex items-center justify-center">
                {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
              </span>
            )}
          </button>

          {/* Profile Link (visible if not creating host) */}
          {!isBecomeHost && (
             <Link
              href="/profile"
              className={`relative p-2 rounded-lg transition-colors ${
                isProfile 
                  ? 'bg-[var(--sky-blue-lighter)]/50 text-[var(--foreground)]' 
                  : 'bg-[var(--sky-blue-lighter)]/30 hover:bg-[var(--sky-blue-lighter)]/50 text-[var(--foreground)]'
              }`}
              title="My Profile"
             >
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
               </svg>
             </Link>
          )}

        </div>
      </div>
    </header>
  );
}
