'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChatMessage } from './chat-message';

interface HostMatch {
  id: string;
  name: string;
  city: string;
  country: string;
  photo: string;
  quote: string;
  interests: string[];
}

// Threshold in pixels from bottom to enable auto-scroll
const AUTO_SCROLL_THRESHOLD = 100;

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  
  const [localInput, setLocalInput] = useState('');
  const { messages, sendMessage, status, error } = useChat();
  const isLoading = status === 'submitted' || status === 'streaming';
  
  // Track if user is near the bottom (within threshold)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Check if scrolled within threshold of bottom
  const isNearBottom = useCallback((container: HTMLElement) => {
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight <= AUTO_SCROLL_THRESHOLD;
  }, []);

  // Handle scroll events to track user position
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    
    const nearBottom = isNearBottom(container);
    setShouldAutoScroll(nearBottom);
    setShowScrollButton(!nearBottom);
  }, [isNearBottom]);

  // Scroll to bottom function
  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
      setShouldAutoScroll(true);
      setShowScrollButton(false);
    }
  }, []);

  const handleLocalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localInput.trim()) return;

    const content = localInput;
    setLocalInput('');
    // Auto-scroll when user sends a new message
    setShouldAutoScroll(true);
    setShowScrollButton(false);
    await sendMessage({ text: content }); 
  };

  // Smart auto-scroll: only scroll when user is near bottom
  useEffect(() => {
    if (!shouldAutoScroll) return;
    
    const container = messagesContainerRef.current;
    if (container) {
      // Use requestAnimationFrame for smoother scrolling without blocking UI
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }, [messages, shouldAutoScroll]);

  // Handle tool results - navigation
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage.parts) {
      for (const part of lastMessage.parts) {
        if (part.type === 'tool-navigate' && 'state' in part && part.state === 'output-available' && 'output' in part) {
          const result = part.output as { success: boolean; url?: string; action?: string };
          if (result.success && result.action === 'navigate' && result.url) {
            router.push(result.url);
          }
        }
      }
    }
  }, [messages, router]);

  // Extract host matches from messages
  const getHostMatches = (message: typeof messages[0]): HostMatch[] => {
    if (!message.parts) return [];
    
    for (const part of message.parts) {
      if (part.type === 'tool-matchHosts' && 'state' in part && part.state === 'output-available' && 'output' in part) {
        const result = part.output as { success: boolean; matches?: HostMatch[] };
        if (result.success && result.matches) {
          return result.matches;
        }
      }
    }
    return [];
  };

  return (
    <>
      {/* Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[var(--princeton-orange)] rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group hover:scale-105"
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>

      {/* Chat Panel */}
      <div
        className={`fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-48px)] bg-[var(--background)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden transition-all duration-300 ${
          isOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[var(--princeton-orange)] to-[var(--blue-green)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-xl">🤝</span>
            </div>
            <div>
              <h3 className="text-white font-semibold">Find Your Person</h3>
              <p className="text-white/80 text-sm">Tell me where you're going!</p>
            </div>
          </div>
        </div>

        {/* Messages Container - relative wrapper for scroll button positioning */}
        <div className="relative">
          <div 
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="h-[400px] overflow-y-auto p-4 space-y-3 scroll-smooth"
          >
          {messages.length === 0 && (
            <div className="text-center py-8 text-[var(--muted-foreground)]">
              <p className="text-sm">👋 Hey! I can help you find locals who match your vibe.</p>
              <p className="text-xs mt-2">Try: "I'm going to Rome and I love food and art"</p>
            </div>
          )}
          
          {messages.map((message) => {
            const textContent = message.parts
              ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
              .map((part) => part.text)
              .join('') || '';
            
            const hostMatches = message.role === 'assistant' ? getHostMatches(message) : [];
            
            return (
              <div key={message.id}>
                {textContent && (
                  <ChatMessage
                    role={message.role as 'user' | 'assistant'}
                    content={textContent}
                  />
                )}
                
                {/* Host Match Cards */}
                {hostMatches.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {hostMatches.map((host) => (
                      <Link
                        key={host.id}
                        href={`/hosts/${host.id}`}
                        className="block bg-white rounded-xl p-3 shadow-sm border border-[var(--border)] hover:shadow-md transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={host.photo}
                            alt={host.name}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-[var(--foreground)] text-sm">{host.name}</h4>
                            <p className="text-xs text-[var(--muted-foreground)]">📍 {host.city}, {host.country}</p>
                          </div>
                          <svg className="w-4 h-4 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                        <p className="text-xs text-[var(--muted-foreground)] mt-2 italic line-clamp-1">"{host.quote}"</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {host.interests.slice(0, 3).map((interest) => (
                            <span key={interest} className="px-2 py-0.5 text-xs rounded-full bg-[var(--sand-beige)] text-[var(--foreground)]">
                              {interest}
                            </span>
                          ))}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-[var(--card-background)] border border-[var(--border)] px-4 py-3 rounded-2xl rounded-bl-md">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-[var(--muted-foreground)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-[var(--muted-foreground)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-[var(--muted-foreground)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-center py-2 text-red-500 text-sm">
              Something went wrong. Please try again.
            </div>
          )}
          
            <div ref={messagesEndRef} />
          </div>
          
          {/* Scroll to bottom button */}
          {showScrollButton && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 w-8 h-8 bg-[var(--card-background)] border border-[var(--border)] rounded-full shadow-lg flex items-center justify-center hover:bg-[var(--muted)] transition-all duration-200 animate-fade-in z-10"
              aria-label="Scroll to bottom"
            >
              <svg 
                className="w-4 h-4 text-[var(--foreground)]" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M19 14l-7 7m0 0l-7-7m7 7V3" 
                />
              </svg>
            </button>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleLocalSubmit} className="p-4 border-t border-[var(--border)]">
          <div className="flex gap-2">
            <input
              type="text"
              value={localInput}
              onChange={(e) => setLocalInput(e.target.value)}
              placeholder="Where are you heading?"
              className="flex-1 px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-full text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--blue-green)] focus:border-transparent transition-all"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !localInput.trim()}
              className="w-10 h-10 bg-[var(--princeton-orange)] rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--blue-green)] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
