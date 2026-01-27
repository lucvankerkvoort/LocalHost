'use client';

import { useState, useRef, useEffect } from 'react';

interface Conversation {
  id: string;
  hostId: string;
  hostName: string;
  hostPhoto: string;
  lastMessage: string;
  timestamp: Date;
  unread: number;
}

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'host';
  timestamp: Date;
}

interface P2PChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Left-side collapsible panel for P2P messaging with localhost hosts.
 * Shows list of conversations and allows direct messaging.
 */
export function P2PChatPanel({ isOpen, onClose }: P2PChatPanelProps) {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mock conversations - in real app, this would come from API/Redux
  const [conversations] = useState<Conversation[]>([
    {
      id: 'conv-1',
      hostId: 'host-akira',
      hostName: 'Akira Tanaka',
      hostPhoto: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop',
      lastMessage: 'Looking forward to meeting you!',
      timestamp: new Date(),
      unread: 1,
    },
  ]);

  // Mock messages for selected conversation
  const [messages] = useState<Message[]>([
    {
      id: 'msg-1',
      content: 'Hi Akira! I\'m excited about the coffee roasting experience!',
      sender: 'user',
      timestamp: new Date(Date.now() - 3600000),
    },
    {
      id: 'msg-2',
      content: 'Looking forward to meeting you!',
      sender: 'host',
      timestamp: new Date(),
    },
  ]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedConversation]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;
    
    // TODO: Implement actual message sending
    console.log('Sending message:', messageInput);
    setMessageInput('');
  };

  const selectedHost = conversations.find(c => c.id === selectedConversation);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/30 z-40 lg:hidden"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="fixed left-0 top-16 bottom-0 w-[400px] max-w-[90vw] bg-[var(--background)] z-50 shadow-2xl border-r border-[var(--border)] flex flex-col animate-slide-in-left">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="font-semibold text-[var(--foreground)] flex items-center gap-2">
            <span className="text-xl">💬</span>
            Messages
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--muted)] rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {selectedConversation ? (
          // Chat View
          <>
            {/* Chat Header */}
            <div className="p-3 border-b border-[var(--border)] flex items-center gap-3">
              <button
                onClick={() => setSelectedConversation(null)}
                className="p-1.5 hover:bg-[var(--muted)] rounded-lg transition-colors"
              >
                ←
              </button>
              {selectedHost && (
                <div className="flex items-center gap-2">
                  <img
                    src={selectedHost.hostPhoto}
                    alt={selectedHost.hostName}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                  <span className="font-medium">{selectedHost.hostName}</span>
                </div>
              )}
            </div>
            
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                      msg.sender === 'user'
                        ? 'bg-[var(--princeton-orange)] text-white rounded-br-md'
                        : 'bg-[var(--muted)] text-[var(--foreground)] rounded-bl-md'
                    }`}
                  >
                    <p className="text-sm">{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${
                      msg.sender === 'user' ? 'text-white/70' : 'text-[var(--muted-foreground)]'
                    }`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            
            {/* Message Input */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-[var(--border)]">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 rounded-full border border-[var(--border)] 
                            focus:outline-none focus:ring-2 focus:ring-[var(--princeton-orange)]"
                />
                <button
                  type="submit"
                  disabled={!messageInput.trim()}
                  className="w-10 h-10 rounded-full bg-[var(--princeton-orange)] text-white
                            hover:bg-[var(--princeton-dark)] transition-colors
                            disabled:opacity-50 disabled:cursor-not-allowed
                            flex items-center justify-center"
                >
                  ➤
                </button>
              </div>
            </form>
          </>
        ) : (
          // Conversations List
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-8 text-center text-[var(--muted-foreground)]">
                <p className="text-4xl mb-3">💬</p>
                <p className="font-medium">No conversations yet</p>
                <p className="text-sm mt-1">
                  Message a localhost to start planning your experience!
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv.id)}
                    className="w-full p-4 flex items-center gap-3 hover:bg-[var(--muted)]/50 transition-colors text-left"
                  >
                    <div className="relative">
                      <img
                        src={conv.hostPhoto}
                        alt={conv.hostName}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      {conv.unread > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--princeton-orange)] text-white text-xs font-bold rounded-full flex items-center justify-center">
                          {conv.unread}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-[var(--foreground)]">{conv.hostName}</span>
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {conv.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--muted-foreground)] truncate">
                        {conv.lastMessage}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
