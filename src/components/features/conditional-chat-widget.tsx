'use client';

import { usePathname } from 'next/navigation';
import { ChatWidget } from './chat-widget';

// Pages where the inline AI chat is used instead of the floating widget
const PAGES_WITHOUT_FLOATING_CHAT = ['/'];

export function ConditionalChatWidget() {
  const pathname = usePathname();
  
  // Don't show floating chat on pages that have inline chat
  if (PAGES_WITHOUT_FLOATING_CHAT.includes(pathname)) {
    return null;
  }
  
  return <ChatWidget />;
}
