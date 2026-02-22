'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import Link from 'next/link';
import {
  DndContext,
  useDraggable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { usePathname } from 'next/navigation';
import { ChatMessage } from './chat-message';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { ingestToolInvocations, ingestToolParts } from '@/lib/ai/tool-events';
import { selectHostCreation } from '@/store/host-creation-slice';
import {
  HOST_ONBOARDING_START_TOKEN,
  PLANNER_ONBOARDING_START_TOKEN,
  HANDSHAKE_STORAGE_PREFIX,
  buildHostOnboardingTrigger,
  buildPlannerOnboardingTrigger,
  type ChatWidgetIntent,
  getChatId,
  getHostDraftIdFromPath,
  getHostToolOnlyFallbackQuestion,
  getChatIntent,
  resolveHostOnboardingStage,
  shouldStartHostOnboardingHandshake,
  shouldStartPlannerHandshake,
} from './chat-widget-handshake';
import {
  UserSearch,
  House,
  MessageCircle,
  X,
  ArrowDown,
  ArrowRight,
  RotateCw,
  MapPin,
  Wrench,
  Send,
} from 'lucide-react';

type ChatToolInvocation = {
  toolName?: string;
  state?: string;
  result?: unknown;
};

type ChatMessagePart = {
  type?: string;
  text?: string;
  toolName?: string;
  state?: string;
  output?: unknown;
};

type ChatMessageRecord = {
  id?: string;
  role?: string;
  content?: string;
  parts?: ChatMessagePart[];
  toolInvocations?: ChatToolInvocation[];
};

type UseChatResult = {
  messages: ChatMessageRecord[];
  sendMessage?: (message: { text: string }, options?: { body?: Record<string, unknown> }) => Promise<void> | void;
  status: string;
  error?: Error | null;
};

interface HostMatch {
  id: string;
  name: string;
  city: string;
  country: string;
  photo: string;
  quote: string;
  interests: string[];
}

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

// Intent-based UI configuration
const INTENT_UI_CONFIG = {
  general: {
    Icon: UserSearch,
    title: 'Find Your Person',
    subtitle: 'Tell me where you\'re going!',
    emptyStateGreeting: 'Hey! I can help you find locals who match your vibe.',
    emptyStateHint: 'Try: "I\'m going to Rome and I love food and art"',
    inputPlaceholder: 'Where are you heading?',
  },
  become_host: {
    Icon: House,
    title: 'Create Your Experience',
    subtitle: 'I\'ll help you set up your hosting profile',
    emptyStateGreeting: 'Ready to become a host? Let\'s start with your city!',
    emptyStateHint: 'Tell me which city you\'re in, e.g. "I\'m in Barcelona"',
    inputPlaceholder: 'Which city are you in?',
  },
  profile_setup: {
    Icon: UserSearch,
    title: 'Profile Agent',
    subtitle: 'Building your profile',
    emptyStateGreeting: 'Let\'s build your traveler profile together.',
    emptyStateHint: 'Tell me about yourself — where you\'re from, what you love.',
    inputPlaceholder: 'Tell me about yourself…',
  },
} as const;


interface ChatWidgetProps {
  intent?: ChatWidgetIntent;
  isActive?: boolean;
}

export function ChatWidget({ intent: intentOverride, isActive = true }: ChatWidgetProps = {}) {
  const pathname = usePathname();
  const intent = getChatIntent(pathname, intentOverride);
  const uiConfig = INTENT_UI_CONFIG[intent];
  const hostCreationState = useAppSelector(selectHostCreation);
  const activeTripId = useAppSelector((state) => state.globe.tripId);
  const tripIdFromPath =
    pathname?.startsWith('/trips/') && pathname.length > '/trips/'.length
      ? pathname.split('/').filter(Boolean)[1] ?? null
      : null;
  const scopedTripId = activeTripId || tripIdFromPath;
  // Stable chat ID per intent/session (draft-specific for host onboarding)
  const chatId = getChatId(intent, pathname, scopedTripId);

  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const seenToolEventsRef = useRef<Set<string>>(new Set());
  const handshakeTriggeredRef = useRef<Set<string>>(new Set());
  const dispatch = useAppDispatch();
  const routeDraftId = getHostDraftIdFromPath(pathname);
  const isDraftReady =
    intent !== 'become_host'
      ? true
      : Boolean(
          routeDraftId &&
            hostCreationState.isHydrated &&
            hostCreationState.draftId === routeDraftId
        );
  const onboardingStage = resolveHostOnboardingStage({
    city: hostCreationState.city,
    stops: hostCreationState.stops,
    title: hostCreationState.title,
    shortDesc: hostCreationState.shortDesc,
    longDesc: hostCreationState.longDesc,
    duration: hostCreationState.duration,
  });

  // Use the chatId to maintain separate conversations per intent
  const { messages, sendMessage, status, error } = useChat({ id: chatId }) as UseChatResult;
  const isLoading = status === 'submitted' || status === 'streaming';

  const [localInput, setLocalInput] = useState('');

  // Track if user is near the bottom (within threshold)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Draggable position state
  const [panelPosition, setPanelPosition] = useState<Position>(DEFAULT_POSITION);

  const chatRequestBody = useCallback(() => {
    if (intent !== 'become_host') {
      return scopedTripId ? { intent, tripId: scopedTripId } : { intent };
    }

    return {
      intent,
      onboardingStage,
    };
  }, [intent, onboardingStage, scopedTripId]);

  // Proactive onboarding trigger (silent handshake) for become-host context.
  useEffect(() => {
    if (!sendMessage) return;

    const storageKey = `${HANDSHAKE_STORAGE_PREFIX}${chatId}`;
    const alreadyTriggered =
      handshakeTriggeredRef.current.has(chatId) ||
      (typeof window !== 'undefined' && sessionStorage.getItem(storageKey) === '1');

    if (
      !shouldStartHostOnboardingHandshake({
        intent,
        isActive,
        pathname,
        messageCount: messages.length,
        alreadyTriggered,
        isDraftReady,
      })
    ) {
      return;
    }

    handshakeTriggeredRef.current.add(chatId);
    sessionStorage.setItem(storageKey, '1');

    const trigger = buildHostOnboardingTrigger(onboardingStage);

    void Promise.resolve(sendMessage({ text: trigger }, { body: chatRequestBody() })).catch(() => {
      // Keep one-shot behavior to avoid duplicate handshake sends in Strict Mode.
    });
  }, [
    chatId,
    chatRequestBody,
    intent,
    isActive,
    isDraftReady,
    messages.length,
    onboardingStage,
    pathname,
    sendMessage,
  ]);

  // Proactive planner trigger (silent handshake) for trip planner context.
  useEffect(() => {
    if (!sendMessage) return;

    const storageKey = `${HANDSHAKE_STORAGE_PREFIX}${chatId}:planner`;
    const alreadyTriggered =
      handshakeTriggeredRef.current.has(storageKey) ||
      (typeof window !== 'undefined' && sessionStorage.getItem(storageKey) === '1');

    if (
      !shouldStartPlannerHandshake({
        intent,
        isActive,
        pathname,
        messageCount: messages.length,
        alreadyTriggered,
      })
    ) {
      return;
    }

    handshakeTriggeredRef.current.add(storageKey);
    sessionStorage.setItem(storageKey, '1');

    const trigger = buildPlannerOnboardingTrigger();
    void Promise.resolve(sendMessage({ text: trigger }, { body: chatRequestBody() })).catch(() => {
      // Keep one-shot behavior to avoid duplicate handshake sends in Strict Mode.
    });
  }, [chatId, chatRequestBody, intent, isActive, messages.length, pathname, sendMessage]);

  // Auto-open/close on specific routes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Define "Globe Pages" where chat should be auto-opened
    // Only open on specific Trip or Draft pages, not on the list/root pages.
    const isTripPage = pathname.startsWith('/trips/') && pathname.length > '/trips/'.length;
    const isHostDraftPage = pathname.startsWith('/become-host/') && pathname.length > '/become-host/'.length;
    
    const isAutoOpenPage = isTripPage || isHostDraftPage;

    if (isAutoOpenPage) {
      setIsOpen(true);
    }

    // Cleanup: If we are leaving an auto-open page, close the chat.
    // This preserves manual open state on other pages (user opens on Home -> navigates to About -> stays open).
    // But (Trips -> Home) -> closes.
    return () => {
      if (isAutoOpenPage) {
        setIsOpen(false);
      }
    };
  }, [pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Load saved position from localStorage on mount
  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */

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
  const handleDragEnd = useCallback((event: DragEndEvent) => {
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
        await sendMessage({ text }, { body: chatRequestBody() });
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
  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */

  // Handle tool results - dispatch tool events for shared reducers
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];

    // Debug: Log messages and tool invocations
    if (lastMessage) {
      console.log('[ChatWidget] Last message:', {
        role: lastMessage.role,
        hasToolInvocations: !!lastMessage.toolInvocations,
        toolCount: lastMessage.toolInvocations?.length || 0,
        toolNames: lastMessage.toolInvocations?.map((t) => t.toolName) || [],
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
      ingestToolParts(dispatch, parts, 'chat', seenToolEventsRef.current, {
        tripId: activeTripId,
      });
      return;
    }

    if (lastMessage?.toolInvocations) {
      ingestToolInvocations(dispatch, lastMessage.toolInvocations, 'chat', {
        tripId: activeTripId,
      });
    }
  }, [activeTripId, dispatch, messages]);

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
            sendMessage({ text }, { body: chatRequestBody() });
          }
        }, 100);
      }
    };

    window.addEventListener('send-chat-message', handleCustomMessage);
    return () => window.removeEventListener('send-chat-message', handleCustomMessage);
  }, [chatRequestBody, sendMessage]);

  // Extract host matches from messages
  const getHostMatches = (message: ChatMessageRecord): HostMatch[] => {
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
        data-testid="chat-toggle"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[var(--princeton-orange)] rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group hover:scale-105"
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <MessageCircle className="w-6 h-6 text-white" />
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
                    <uiConfig.Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-semibold">{uiConfig.title}</h3>
                    <p className="text-white/80 text-sm">Drag header to move • {uiConfig.subtitle}</p>
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
                      <RotateCw className="w-4 h-4 text-white" />
                    </button>
                  )}
                </div>
              </div>


              {/* Messages Container - relative wrapper for scroll button positioning */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <div
                  ref={messagesContainerRef}
                  data-testid="chat-messages"
                  onScroll={handleScroll}
                  className="h-[400px] overflow-y-auto p-4 space-y-3 scroll-smooth"
                >
                {messages.length === 0 && (
                  <div className="text-center py-8 text-[var(--muted-foreground)]">
                    <p className="text-sm">{uiConfig.emptyStateGreeting}</p>
                    <p className="text-xs mt-2">{uiConfig.emptyStateHint}</p>
                  </div>
                )}

                {messages.map((message) => {
                  const parts = Array.isArray(message.parts) ? message.parts : [];

                  // Debug: log full parts structure for first few renders only
                  if (parts.length > 0) {
                    console.log('[ChatWidget] Parts structure:', parts.map((p) => ({
                      type: p.type,
                      text: p.text,
                      toolName: p.toolName,
                      state: p.state,
                    })));
                  }

                  // Extract text content from parts
                  let textContent = '';
                  const toolCalls: Array<{ name: string; state?: string; output?: unknown }> = [];

                  for (const part of parts) {
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

                  // Fallback: check message.content directly
                  if (!textContent && typeof message.content === 'string') {
                    textContent = message.content;
                  }

                  const trimmedContent = textContent.trim();
                  const isHiddenHandshakeMessage =
                    message.role === 'user' &&
                    (trimmedContent.startsWith(HOST_ONBOARDING_START_TOKEN) ||
                      trimmedContent.startsWith(PLANNER_ONBOARDING_START_TOKEN));
                  if (isHiddenHandshakeMessage) {
                    return null;
                  }

                  const hostMatches = message.role === 'assistant' ? getHostMatches(message) : [];

                  // Show something even if only tool calls (no text)
                  const hasToolCalls = toolCalls.length > 0;
                  const hasNonCompletionToolCall = toolCalls.some((toolCall) => toolCall.name !== 'completeProfile');
                  const shouldShowHostToolOnlyFallback =
                    intent === 'become_host' &&
                    message.role === 'assistant' &&
                    !textContent &&
                    hasNonCompletionToolCall;
                  const displayContent = shouldShowHostToolOnlyFallback
                    ? getHostToolOnlyFallbackQuestion(onboardingStage)
                    : textContent;
                  const showMessage = displayContent || hasToolCalls;

                  if (!showMessage && message.role === 'assistant') {
                    return null; // Skip empty assistant messages
                  }

                  return (
                    <div key={message.id}>
                      {displayContent && (
                        <ChatMessage
                          role={message.role as 'user' | 'assistant'}
                          content={displayContent}
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
                                  <Wrench className="w-4 h-4 text-[var(--foreground)]" />
                                  <span className="font-medium text-[var(--foreground)]">{tc.name}</span>
                                  {(() => {
                                    if (!tc.output || typeof tc.output !== 'object') return null;
                                    if (!('message' in tc.output)) return null;
                                    const value = (tc.output as { message?: unknown }).message;
                                    if (typeof value !== 'string' || value.length === 0) return null;
                                    return (
                                      <span className="text-[var(--foreground)]">- {value}</span>
                                    );
                                  })()}
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
                                  <p className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                                    <MapPin className="w-3 h-3" />
                                    {host.city}, {host.country}
                                  </p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-[var(--muted)]" />
                              </div>
                              <p className="text-xs text-[var(--muted-foreground)] mt-2 italic line-clamp-1">&quot;{host.quote}&quot;</p>
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
                    <ArrowDown className="w-4 h-4 text-[var(--foreground)]" />
                  </button>
                )}
              </div>

              {/* Input */}
              <form onSubmit={handleLocalSubmit} className="p-4 border-t border-[var(--border)]" onClick={(e) => e.stopPropagation()}>
                <div className="flex gap-2">
                  <input
                    type="text"
                    data-testid="chat-input"
                    value={localInput}
                    onChange={(e) => setLocalInput(e.target.value)}
                    placeholder={uiConfig.inputPlaceholder}
                    className="flex-1 px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-full text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--blue-green)] focus:border-transparent transition-all"
                    disabled={isLoading}
                  />
                  <button
                    type="submit"
                    data-testid="chat-send"
                    disabled={isLoading || !localInput.trim()}
                    className="w-10 h-10 bg-[var(--princeton-orange)] rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--blue-green)] transition-colors"
                  >
                    <Send className="w-5 h-5 text-white" />
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
