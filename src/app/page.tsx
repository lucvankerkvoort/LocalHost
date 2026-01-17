'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { Navbar } from '@/components/features';
import { HostCard } from '@/components/features/host-card';
import { ChatMessage } from '@/components/features/chat-message';
import { HOSTS, getAllCities } from '@/lib/data/hosts';

type SearchMode = 'locals' | 'experiences';

export default function Home() {
  const router = useRouter();
  const [searchMode, setSearchMode] = useState<SearchMode>('locals');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  const [localInput, setLocalInput] = useState('');
  const { messages, sendMessage, status, error } = useChat();
  const isLoading = status === 'submitted' || status === 'streaming';
  
  // Auto-scroll state
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  // Check if scrolled within threshold of bottom
  const isNearBottom = useCallback((container: HTMLElement) => {
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight <= 100;
  }, []);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    setShouldAutoScroll(isNearBottom(container));
  }, [isNearBottom]);

  // Auto-scroll when messages change
  useEffect(() => {
    if (!shouldAutoScroll) return;
    const container = messagesContainerRef.current;
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }, [messages, shouldAutoScroll]);

  // Handle navigation from AI tool results
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localInput.trim()) return;

    const modeContext = searchMode === 'locals' 
      ? 'The user wants to find LOCAL HOSTS/PEOPLE to meet. Navigate them to the /hosts page with appropriate filters.'
      : 'The user wants to find EXPERIENCES/ACTIVITIES. Navigate them to the /explore page with appropriate search.';
    
    const content = `[Mode: ${searchMode}] ${localInput}\n\nContext: ${modeContext}`;
    setLocalInput('');
    setShouldAutoScroll(true);
    await sendMessage({ text: content });
  };

  // Featured hosts for the homepage
  const featuredHosts = HOSTS.slice(0, 3);

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero Section - AI-First Entry */}
      <section className="relative pt-32 pb-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--sky-blue-light)]/30 via-[var(--background)] to-[var(--amber-flame)]/10 -z-10" />
        <div className="absolute top-20 right-10 w-64 h-64 bg-[var(--princeton-orange)]/10 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-[var(--blue-green)]/10 rounded-full blur-3xl -z-10" />

        <div className="max-w-4xl mx-auto">
          <div className="text-center animate-fade-in mb-12">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[var(--foreground)] leading-tight mb-6">
              {searchMode === 'locals' ? (
                <>Meet Locals Who <span className="text-[var(--princeton-orange)]">Get You</span></>
              ) : (
                <>Discover Experiences That <span className="text-[var(--princeton-orange)]">Move You</span></>
              )}
            </h1>
            <p className="text-lg sm:text-xl text-[var(--muted-foreground)] max-w-2xl mx-auto">
              {searchMode === 'locals' 
                ? "Skip the tourist traps. Connect with real people who'll show you their world—the way they'd show a friend."
                : "Find authentic activities hosted by locals. From cooking classes to hidden tours, discover what makes each place special."
              }
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex bg-white rounded-full p-1 shadow-md border border-[var(--border)]">
              <button
                onClick={() => setSearchMode('locals')}
                className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
                  searchMode === 'locals'
                    ? 'bg-[var(--princeton-orange)] text-white shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                🤝 Find Locals
              </button>
              <button
                onClick={() => setSearchMode('experiences')}
                className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
                  searchMode === 'experiences'
                    ? 'bg-[var(--blue-green)] text-white shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                ✨ Find Experiences
              </button>
            </div>
          </div>

          {/* AI Chat Search Interface */}
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden max-w-2xl mx-auto border border-[var(--border)]">
            {/* Chat Header */}
            <div className="bg-gradient-to-r from-[var(--princeton-orange)] to-[var(--blue-green)] px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <span className="text-lg">{searchMode === 'locals' ? '🤝' : '✨'}</span>
                </div>
                <div>
                  <h3 className="text-white font-medium text-sm">
                    {searchMode === 'locals' ? 'Find Your Person' : 'Discover Experiences'}
                  </h3>
                  <p className="text-white/80 text-xs">Tell me where you're going and what you love</p>
                </div>
              </div>
            </div>

            {/* Messages Container */}
            <div 
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="h-[200px] overflow-y-auto p-4 space-y-3 scroll-smooth bg-[var(--background)]/50"
            >
              {messages.length === 0 && (
                <div className="text-center py-6 text-[var(--muted-foreground)]">
                  <p className="text-sm">
                    {searchMode === 'locals' 
                      ? '👋 Tell me where you\'re heading and what you\'re into!'
                      : '👋 What kind of experience are you looking for?'
                    }
                  </p>
                  <p className="text-xs mt-2 opacity-70">
                    {searchMode === 'locals'
                      ? 'Try: "Rome, I love food and want to explore nightlife"'
                      : 'Try: "Tokyo, looking for a cooking class or food tour"'
                    }
                  </p>
                </div>
              )}
              
              {messages.map((message) => {
                const textContent = message.parts
                  ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
                  .map((part) => part.text)
                  .join('') || '';
                
                // Clean up the mode prefix from user messages
                const displayContent = message.role === 'user' 
                  ? textContent.replace(/^\[Mode: (locals|experiences)\]\s*/i, '').split('\n\nContext:')[0]
                  : textContent;
                
                return displayContent ? (
                  <ChatMessage
                    key={message.id}
                    role={message.role as 'user' | 'assistant'}
                    content={displayContent}
                  />
                ) : null;
              })}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-[var(--card)] border border-[var(--border)] px-4 py-3 rounded-2xl rounded-bl-md">
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

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-4 border-t border-[var(--border)] bg-white">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={localInput}
                  onChange={(e) => setLocalInput(e.target.value)}
                  placeholder={searchMode === 'locals' 
                    ? "Where are you heading? What are you into?"
                    : "What kind of experience are you looking for?"
                  }
                  className="flex-1 px-4 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-full text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--blue-green)] focus:border-transparent transition-all"
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

          {/* Quick links */}
          <p className="text-center text-sm text-[var(--muted-foreground)] mt-4">
            Or{' '}
            <button 
              onClick={() => router.push(searchMode === 'locals' ? '/hosts' : '/explore')} 
              className="text-[var(--princeton-orange)] hover:underline font-medium"
            >
              browse all {searchMode === 'locals' ? 'locals' : 'experiences'}
            </button>
          </p>
        </div>
      </section>

      {/* Featured Locals */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-[var(--foreground)]">
                Featured Locals
              </h2>
              <p className="text-[var(--muted-foreground)] mt-1">
                Real people, ready to show you their world
              </p>
            </div>
            <Link href="/hosts" className="text-[var(--princeton-orange)] hover:underline font-medium">
              Meet all →
            </Link>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredHosts.map((host) => (
              <HostCard key={host.id} host={host} />
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-[var(--foreground)] mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: '🗺️',
                title: 'Tell Us Where',
                description: 'Pick your destination. We\'ll find locals who live there.',
              },
              {
                icon: '💬',
                title: 'Share Your Vibe',
                description: 'What are you into? Food, art, nightlife? We\'ll match you.',
              },
              {
                icon: '🤝',
                title: 'Meet Your Person',
                description: 'Connect with a local who gets you. No tourist traps, just real moments.',
              },
            ].map((step, index) => (
              <div key={index} className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-full bg-[var(--sky-blue-light)]/30 flex items-center justify-center text-4xl mb-4">
                  {step.icon}
                </div>
                <h3 className="text-xl font-semibold text-[var(--foreground)] mb-2">{step.title}</h3>
                <p className="text-[var(--muted-foreground)]">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial/Quote Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[var(--blue-green)]">
        <div className="max-w-3xl mx-auto text-center">
          <blockquote className="text-2xl sm:text-3xl text-white font-medium italic mb-6">
            "I met Carlos in Mexico City and he took me to places I never would have found. We're still in touch 2 years later."
          </blockquote>
          <cite className="text-white/80 not-italic">— Sarah, traveled from New York</cite>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-[var(--princeton-orange)] to-[var(--amber-flame)]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            You Know Your City Best
          </h2>
          <p className="text-lg text-white/90 mb-8">
            Share what you love with travelers. Cook your grandmother's recipes. Show off your favorite spots. Be the host you'd want to meet.
          </p>
          <Link
            href="/become-host"
            className="inline-block px-8 py-4 bg-white text-[var(--princeton-orange)] rounded-xl font-semibold text-lg hover:shadow-lg transition-all"
          >
            Become a Host
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-[var(--deep-space-blue)]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-semibold text-white mb-4">Discover</h4>
              <ul className="space-y-2">
                <li><Link href="/hosts" className="text-white/70 hover:text-white transition-colors">Meet Locals</Link></li>
                <li><Link href="/explore" className="text-white/70 hover:text-white transition-colors">Experiences</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Host</h4>
              <ul className="space-y-2">
                <li><Link href="/become-host" className="text-white/70 hover:text-white transition-colors">Become a Host</Link></li>
                <li><Link href="/host/resources" className="text-white/70 hover:text-white transition-colors">Resources</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Support</h4>
              <ul className="space-y-2">
                <li><Link href="/help" className="text-white/70 hover:text-white transition-colors">Help Center</Link></li>
                <li><Link href="/safety" className="text-white/70 hover:text-white transition-colors">Safety</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2">
                <li><Link href="/about" className="text-white/70 hover:text-white transition-colors">About Us</Link></li>
                <li><Link href="/careers" className="text-white/70 hover:text-white transition-colors">Careers</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/20 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏠</span>
              <span className="font-bold text-white">Localhost</span>
            </div>
            <p className="text-white/60 text-sm">
              © 2026 Localhost. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
