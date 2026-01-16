'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { ChatMessage } from './chat-message';

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [localInput, setLocalInput] = useState('');
  // derived status
  const { messages, sendMessage, status, error } = useChat();
  const isLoading = status === 'submitted' || status === 'streaming';
  
  console.log('useChat return:', { messages, sendMessage, status, error });

  const handleLocalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localInput.trim()) return;

    const content = localInput;
    setLocalInput('');
    await sendMessage({ text: content }); 
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <>
      {/* Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-r from-[var(--sunset-orange)] to-[var(--terracotta)] rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group hover:scale-105"
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
        <div className="bg-gradient-to-r from-[var(--sunset-orange)] to-[var(--terracotta)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-semibold">Localhost Assistant</h3>
              <p className="text-white/80 text-sm">Ask me about experiences!</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="h-[350px] overflow-y-auto p-4 space-y-1">
          {messages.length === 0 && (
            <div className="text-center py-8 text-[var(--muted-foreground)]">
              <p className="text-sm">👋 Hi! I'm here to help you discover amazing local experiences.</p>
              <p className="text-xs mt-2">Try asking about cooking classes, walking tours, or hiking adventures!</p>
            </div>
          )}
          
          {messages.map((message) => {
            // Extract text content from the message parts
            const textContent = message.parts
              ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
              .map((part) => part.text)
              .join('') || '';
            
            return (
              <ChatMessage
                key={message.id}
                role={message.role as 'user' | 'assistant'}
                content={textContent}
              />
            );
          })}
          
          {isLoading && (
            <div className="flex justify-start mb-3">
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

        {/* Input */}
        {/* Input */}
        <form onSubmit={handleLocalSubmit} className="p-4 border-t border-[var(--border)]">
          <div className="flex gap-2">
            <input
              type="text"
              value={localInput}
              onChange={(e) => setLocalInput(e.target.value)}
              placeholder="Ask about experiences..."
              className="flex-1 px-4 py-2.5 bg-[var(--card-background)] border border-[var(--border)] rounded-full text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--sunset-orange)] focus:border-transparent transition-all"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !localInput.trim()}
              className="w-10 h-10 bg-[var(--sunset-orange)] rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--terracotta)] transition-colors"
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
