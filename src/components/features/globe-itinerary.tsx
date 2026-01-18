'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useChat } from '@ai-sdk/react';
import { 
  GlobeDestination, 
  TravelRoute, 
  SAMPLE_DESTINATIONS, 
  SAMPLE_ROUTES,
  generateId,
  getColorForDay,
} from '@/types/globe';

// Dynamic import for Cesium (no SSR)
const CesiumGlobe = dynamic(() => import('./cesium-globe'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--deep-space-blue)]">
      <div className="text-white animate-pulse">Loading globe...</div>
    </div>
  ),
});

export default function GlobeItinerary() {
  const [destinations, setDestinations] = useState<GlobeDestination[]>([]);
  const [routes, setRoutes] = useState<TravelRoute[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(true);
  const [localInput, setLocalInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // AI Chat hook - using the same pattern as chat-widget
  const { messages, sendMessage, status, error } = useChat();
  const isLoading = status === 'submitted' || status === 'streaming';

  // Parse AI response for destination data
  const parseDestinationsFromResponse = useCallback((content: string) => {
    // Look for JSON blocks in the response
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        if (data.destinations && Array.isArray(data.destinations)) {
          const newDestinations: GlobeDestination[] = data.destinations.map((d: any, i: number) => ({
            id: generateId(),
            name: d.name || d.city,
            lat: d.lat || d.latitude,
            lng: d.lng || d.longitude || d.lon,
            day: d.day || i + 1,
            activities: d.activities || [],
            color: getColorForDay(d.day || i + 1),
          }));
          
          setDestinations(newDestinations);
          
          // Create routes between consecutive destinations
          const newRoutes: TravelRoute[] = [];
          for (let i = 0; i < newDestinations.length - 1; i++) {
            newRoutes.push({
              id: generateId(),
              fromId: newDestinations[i].id,
              toId: newDestinations[i + 1].id,
              fromLat: newDestinations[i].lat,
              fromLng: newDestinations[i].lng,
              toLat: newDestinations[i + 1].lat,
              toLng: newDestinations[i + 1].lng,
              mode: 'flight',
            });
          }
          setRoutes(newRoutes);
          
          // Select first destination
          if (newDestinations.length > 0) {
            setSelectedDestination(newDestinations[0].id);
          }
        }
      } catch {
        // Not valid JSON, ignore
      }
    }
  }, []);

  // Watch for new messages and parse destinations
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage.parts) {
      const textContent = lastMessage.parts
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map((part) => part.text)
        .join('');
      
      if (textContent) {
        parseDestinationsFromResponse(textContent);
      }
    }
  }, [messages, parseDestinationsFromResponse]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load sample data for demo
  const loadSampleData = () => {
    setDestinations(SAMPLE_DESTINATIONS);
    setRoutes(SAMPLE_ROUTES);
    setSelectedDestination(SAMPLE_DESTINATIONS[0].id);
  };

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localInput.trim()) return;
    
    const content = localInput;
    setLocalInput('');
    await sendMessage({ text: content });
  };

  // Extract text content from message parts
  const getMessageText = (message: typeof messages[0]): string => {
    if (!message.parts) return '';
    return message.parts
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('');
  };

  return (
    <div className="h-screen flex flex-col bg-[var(--deep-space-blue)]">
      {/* Header */}
      <header className="flex-shrink-0 bg-[var(--background)]/95 backdrop-blur-md border-b border-[var(--border)] px-4 py-3 z-20">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌍</span>
            <h1 className="font-bold text-xl text-[var(--foreground)]">Trip Planner</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadSampleData}
              className="px-3 py-1.5 text-sm rounded-lg bg-[var(--sky-blue-lighter)]/30 text-[var(--foreground)] hover:bg-[var(--sky-blue-lighter)]/50 transition-colors"
            >
              Load Demo
            </button>
            <button
              onClick={() => setShowTimeline(!showTimeline)}
              className="px-3 py-1.5 text-sm rounded-lg bg-[var(--sky-blue-lighter)]/30 text-[var(--foreground)] hover:bg-[var(--sky-blue-lighter)]/50 transition-colors"
            >
              {showTimeline ? 'Hide' : 'Show'} Timeline
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Globe */}
        <div className="flex-1 relative">
          <CesiumGlobe
            destinations={destinations}
            routes={routes}
            selectedDestination={selectedDestination}
            onDestinationClick={(dest) => setSelectedDestination(dest.id)}
          />
        </div>

        {/* Chat Panel */}
        <div className="w-[400px] flex-shrink-0 bg-[var(--background)] border-l border-[var(--border)] flex flex-col">
          {/* Chat header */}
          <div className="flex-shrink-0 bg-gradient-to-r from-[var(--princeton-orange)] to-[var(--blue-green)] px-4 py-3">
            <h2 className="text-white font-semibold">✈️ Plan Your Trip</h2>
            <p className="text-white/80 text-sm">Tell me where you want to go!</p>
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <p className="text-[var(--muted-foreground)]">
                  🌍 Tell me about your dream trip!
                </p>
                <p className="text-sm text-[var(--muted)] mt-2">
                  Try: "Plan a 5-day trip to Japan"
                </p>
              </div>
            )}
            
            {messages.map((message) => {
              const textContent = getMessageText(message);
              if (!textContent) return null;
              
              return (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                      message.role === 'user'
                        ? 'bg-[var(--princeton-orange)] text-white'
                        : 'bg-[var(--sky-blue-lighter)]/30 text-[var(--foreground)]'
                    }`}
                  >
                    <div className="text-sm whitespace-pre-wrap">{textContent}</div>
                  </div>
                </div>
              );
            })}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-[var(--sky-blue-lighter)]/30 rounded-2xl px-4 py-2.5">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            
            {error && (
              <div className="text-center py-2 text-red-500 text-sm">
                Something went wrong. Please try again.
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <form onSubmit={handleSubmit} className="flex-shrink-0 p-4 border-t border-[var(--border)]">
            <div className="flex gap-2">
              <input
                type="text"
                value={localInput}
                onChange={(e) => setLocalInput(e.target.value)}
                placeholder="Plan a trip to..."
                className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-white
                          focus:outline-none focus:ring-2 focus:ring-[var(--blue-green)] focus:border-transparent
                          placeholder:text-[var(--muted)]"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !localInput.trim()}
                className="px-4 py-2.5 rounded-xl bg-[var(--princeton-orange)] text-white font-medium
                          hover:bg-[var(--princeton-dark)] disabled:opacity-50 disabled:cursor-not-allowed
                          transition-colors"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Timeline */}
      {showTimeline && destinations.length > 0 && (
        <div className="flex-shrink-0 bg-[var(--background)] border-t border-[var(--border)] p-4">
          <div className="flex gap-4 overflow-x-auto pb-2">
            {destinations.map((dest) => (
              <button
                key={dest.id}
                onClick={() => setSelectedDestination(dest.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-lg border-2 transition-all ${
                  selectedDestination === dest.id
                    ? 'border-[var(--princeton-orange)] bg-[var(--princeton-orange)]/10'
                    : 'border-[var(--border)] hover:border-[var(--blue-green)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: dest.color }}
                  />
                  <span className="font-medium text-[var(--foreground)]">
                    Day {dest.day}: {dest.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
