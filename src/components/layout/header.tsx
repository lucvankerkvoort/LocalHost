'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setP2PChatOpen } from '@/store/ui-slice';
import { selectTotalUnreadCount } from '@/store/p2p-chat-slice';
import { Comment01Icon, UserCircleIcon } from 'hugeicons-react';

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
  
  const unreadMessageCount = useAppSelector(selectTotalUnreadCount);

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
            data-testid="chat-toggle"
            onClick={() => dispatch(setP2PChatOpen(!isP2PChatOpen))}
            className={`relative p-2 rounded-lg transition-colors cursor-pointer ${
              isP2PChatOpen 
                ? 'bg-[var(--sky-blue-lighter)]/50 text-[var(--foreground)]' 
                : 'bg-[var(--sky-blue-lighter)]/30 hover:bg-[var(--sky-blue-lighter)]/50 text-[var(--foreground)]'
            }`}
            title="Messages"
          >
            <Comment01Icon className="w-5 h-5" />
            {unreadMessageCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--princeton-orange)] text-white text-xs font-bold rounded-full flex items-center justify-center">
                {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
              </span>
            )}
          </button>

          {/* Profile Link (visible if not creating host) */}
          {!isBecomeHost && (
             <Link
              data-testid="user-menu"
              href="/profile"
              className={`relative p-2 rounded-lg transition-colors ${
                isProfile 
                  ? 'bg-[var(--sky-blue-lighter)]/50 text-[var(--foreground)]' 
                  : 'bg-[var(--sky-blue-lighter)]/30 hover:bg-[var(--sky-blue-lighter)]/50 text-[var(--foreground)]'
              }`}
              title="My Profile"
             >
               <UserCircleIcon className="w-5 h-5" />
             </Link>
          )}

        </div>
      </div>
    </header>
  );
}
