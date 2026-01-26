'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import Link from 'next/link';
import {
  DndContext,
  useDraggable,
  DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ChatMessage } from './chat-message';
import { OrchestratorJobStatus } from './orchestrator-job-status';
import { useAppDispatch } from '@/store/hooks';
import { ingestToolInvocations, ingestToolParts } from '@/lib/ai/tool-events';

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

// LocalStorage key for persisting position
const POSITION_STORAGE_KEY = 'chat-widget-position';

// Default position (bottom-right)
const DEFAULT_POSITION = { x: 0, y: 0 };

interface Position {
  x: number;
  y: number;
}

// Hook to get drag handle props
function useDraggablePanel(position: Position, onPositionChange: (pos: Position) => void) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: 'chat-panel',
  });

  // Combine base position with active drag transform
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString({
      x: (transform?.x || 0) + position.x,
      y: (transform?.y || 0) + position.y,
      scaleX: 1,
      scaleY: 1,
    }),
    transition: isDragging ? undefined : 'transform 0.2s ease',
  };

  return {
    containerRef: setNodeRef,
    containerStyle: style,
    dragHandleProps: { ...attributes, ...listeners },
    isDragging,
  };
}

import { usePathname } from 'next/navigation';

export function ChatWidget() {
  const pathname = usePathname();
  const intent = pathname === '/become-host' ? 'become_host' : 'general';

  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const seenToolEventsRef = useRef<Set<string>>(new Set());
  const dispatch = useAppDispatch();
  
  const { messages, sendMessage, status, error } = useChat() as any;
  const isLoading = status === 'submitted' || status === 'streaming';
  
  const [localInput, setLocalInput] = useState('');
  
  // Track if user is near the bottom (within threshold)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  // Draggable position state
  const [panelPosition, setPanelPosition] = useState<Position>(DEFAULT_POSITION);

  // Load saved position from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(POSITION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          setPanelPosition(parsed);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save position helper
  const savePosition = useCallback((pos: Position) => {
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(pos));
  }, []);

  // Sync state with storage when changed (redundant if using savePosition, but good for safety)
  useEffect(() => {
    if (panelPosition !== DEFAULT_POSITION) {
      savePosition(panelPosition);
    }
  }, [panelPosition, savePosition]);

  // Handle panel drag
  const handleDragEnd = useCallback((event: any) => {
    const delta = event.delta;
    setPanelPosition((prev) => {
      const newPos = {
        x: prev.x + delta.x,
        y: prev.y + delta.y,
      };
      return newPos;
    });
  }, []);

  // Handle scroll events to track user position
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    
    setShouldAutoScroll(isNearBottom);
    setShowScrollButton(!isNearBottom);
  };

  // Scroll to bottom function
  const scrollToBottom = () => {
    messagesContainerRef.current?.scrollTo({
      top: messagesContainerRef.current.scrollHeight,
      behavior: 'smooth'
    });
    setShouldAutoScroll(true);
    setShowScrollButton(false);
  }

  const handleLocalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localInput.trim() || isLoading) return;
    
    const text = localInput.trim();
    setLocalInput('');
    
    // Send message with intent - sendMessage expects { text: string }
    if (sendMessage) {
        await sendMessage({ text }, { body: { intent } });
    }
  };

  // Auto-scroll on new messages
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

  // Initial scroll to bottom on open
  useEffect(() => {
    if (isOpen) {
      messagesContainerRef.current?.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
      setShouldAutoScroll(true);
      setShowScrollButton(false);
    }
  }, [isOpen]);

  // Handle tool results - dispatch tool events for shared reducers
  useEffect(() => {
    const lastMessage = messages[messages.length - 1] as any;
    
    // Debug: Log messages and tool invocations
    if (lastMessage) {
      console.log('[ChatWidget] Last message:', {
        role: lastMessage.role,
        hasToolInvocations: !!lastMessage.toolInvocations,
        toolCount: lastMessage.toolInvocations?.length || 0,
        toolNames: lastMessage.toolInvocations?.map((t: any) => t.toolName) || [],
      });
      
      if (lastMessage.toolInvocations) {
        for (const tool of lastMessage.toolInvocations) {
          console.log('[ChatWidget] Tool:', {
            name: tool.toolName,
            state: tool.state,
            result: tool.result,
          });
        }
      }
    }
    
    const parts = lastMessage?.parts;
    const hasToolParts =
      Array.isArray(parts) &&
      parts.some(
        (part: { type?: string }) =>
          part?.type === 'dynamic-tool' || part?.type?.startsWith('tool-')
      );

    if (hasToolParts) {
      ingestToolParts(dispatch, parts, 'chat', seenToolEventsRef.current);
      return;
    }

    if (lastMessage?.toolInvocations) {
      ingestToolInvocations(dispatch, lastMessage.toolInvocations, 'chat');
    }
  }, [dispatch, messages]);

  // Listen for custom chat triggers (e.g. from "Add to Plan" buttons)
  useEffect(() => {
    const handleCustomMessage = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const text = customEvent.detail;
      
      if (text) {
        setIsOpen(true);
        // Small delay to ensure widget animation starts
        setTimeout(() => {
          if (sendMessage) {
            sendMessage({ text }, { body: { intent } });
          }
        }, 100);
      }
    };

    window.addEventListener('send-chat-message', handleCustomMessage);
    return () => window.removeEventListener('send-chat-message', handleCustomMessage);
  }, [sendMessage, intent]);

  // Extract host matches from messages
  const getHostMatches = (message: any): HostMatch[] => {
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

  // Reset position handler
  const resetPosition = useCallback(() => {
    savePosition(DEFAULT_POSITION);
  }, [savePosition]);

  // Use draggable hook
  const { containerRef, containerStyle, dragHandleProps, isDragging } = useDraggablePanel(panelPosition, savePosition);

  return (
    <>
      {/* Chat Button - Fixed position */}
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

      {/* Draggable Chat Panel */}
      <DndContext onDragEnd={handleDragEnd}>
        <div
          className={`fixed bottom-24 right-6 z-50 transition-all duration-300 ${
            isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div ref={containerRef} style={containerStyle}>
            <div className="w-[380px] max-w-[calc(100vw-48px)] bg-[var(--background)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden">
              {/* Draggable Header - ONLY this element has drag listeners */}
              <div 
                {...dragHandleProps}
                className={`bg-gradient-to-r from-[var(--princeton-orange)] to-[var(--blue-green)] px-5 py-4 select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <span className="text-xl">🤝</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-semibold">Find Your Person</h3>
                    <p className="text-white/80 text-sm">Drag header to move • Tell me where you're going!</p>
                  </div>
                  {/* Reset position button */}
                  {(panelPosition.x !== 0 || panelPosition.y !== 0) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        resetPosition();
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
                      title="Reset position"
                    >
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>


              {/* Messages Container - relative wrapper for scroll button positioning */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <div 
                  ref={messagesContainerRef}
                  onScroll={handleScroll}
                  className="h-[400px] overflow-y-auto p-4 space-y-3 scroll-smooth"
                >
                <OrchestratorJobStatus />
                {messages.length === 0 && (
                  <div className="text-center py-8 text-[var(--muted-foreground)]">
                    <p className="text-sm">👋 Hey! I can help you find locals who match your vibe.</p>
                    <p className="text-xs mt-2">Try: "I'm going to Rome and I love food and art"</p>
                  </div>
                )}
                
                {messages.map((message: any) => {
                  // Debug: log full parts structure for first few renders only
                  if (message.parts?.length > 0) {
                    console.log('[ChatWidget] Parts structure:', message.parts.map((p: any) => ({
                      type: p.type,
                      text: p.text,
                      toolName: p.toolName,
                      state: p.state,
                    })));
                  }
                  
                  // Extract text content from parts
                  let textContent = '';
                  const toolCalls: any[] = [];
                  
                  if (message.parts && Array.isArray(message.parts)) {
                    for (const part of message.parts) {
                      if (part.type === 'text' && part.text) {
                        textContent += part.text;
                      } else if (part.type?.startsWith('tool-') && part.type !== 'tool-result') {
                        // Collect tool calls for display
                        toolCalls.push({
                          name: part.type.replace('tool-', ''),
                          state: part.state,
                          output: part.output,
                        });
                      }
                    }
                  }
                  
                  // Fallback: check message.content directly
                  if (!textContent && typeof message.content === 'string') {
                    textContent = message.content;
                  }
                  
                  const hostMatches = message.role === 'assistant' ? getHostMatches(message) : [];
                  
                  // Show something even if only tool calls (no text)
                  const hasToolCalls = toolCalls.length > 0;
                  const showMessage = textContent || hasToolCalls;
                  
                  if (!showMessage && message.role === 'assistant') {
                    return null; // Skip empty assistant messages
                  }
                  
                  return (
                    <div key={message.id}>
                      {textContent && (
                        <ChatMessage
                          role={message.role as 'user' | 'assistant'}
                          content={textContent}
                        />
                      )}
                      
                      {/* Tool Call Status Display */}
                      {hasToolCalls && !textContent && (
                        <div className="flex justify-start mb-2">
                          <div className="bg-[var(--card-background)] border border-[var(--border)] px-4 py-3 rounded-2xl rounded-bl-md">
                            <div className="text-xs text-[var(--muted-foreground)] space-y-1">
                              {toolCalls.map((tc, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${tc.state === 'result' || tc.state === 'output-available' ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                                  <span>🔧 {tc.name}</span>
                                  {tc.output?.message && <span className="text-[var(--foreground)]">- {tc.output.message}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
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
              <form onSubmit={handleLocalSubmit} className="p-4 border-t border-[var(--border)]" onClick={(e) => e.stopPropagation()}>
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
          </div>
        </div>
      </DndContext>
    </>
  );
}
