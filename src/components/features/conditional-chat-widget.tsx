'use client';

import { ChatWidget } from './chat-widget';

/**
 * Conditional Chat Widget - now shows on ALL pages.
 * 
 * The floating ChatWidget is the single source of truth for AI chat interactions.
 * Previously this component would hide the widget on certain pages (like /itinerary),
 * but now we want a consistent chat experience everywhere.
 */
export function ConditionalChatWidget() {
  // Always show the floating chat widget
  return <ChatWidget />;
}
