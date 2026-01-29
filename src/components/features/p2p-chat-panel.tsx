'use client';

import { useState, useRef, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { 
  initThread, 
  sendChatMessage, 
  receiveMessage,
  markThreadAsRead,
  selectAllThreads
} from '@/store/p2p-chat-slice';
import { selectAllHosts } from '@/store/hosts-slice';
import { closeContactHost } from '@/store/ui-slice';

interface P2PChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Left-side collapsible panel for P2P messaging with localhost hosts.
 * Shows list of conversations and allows direct messaging.
 */
export function P2PChatPanel({ isOpen, onClose }: P2PChatPanelProps) {
  /* eslint-disable react-hooks/exhaustive-deps */
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const dispatch = useAppDispatch();
  const threads = useAppSelector(selectAllThreads);
  const selectedThread = threads.find(t => t.bookingId === selectedBookingId);
  const contactHostId = useAppSelector(state => state.ui.contactHostId);
  const allHosts = useAppSelector(selectAllHosts);

  // Sync with global "Contact Host" action
  useEffect(() => {
    if (contactHostId) {
      // Find existing thread for this host
      const existingThread = threads.find(t => t.hostId === contactHostId);
      if (existingThread) {
          setSelectedBookingId(existingThread.bookingId);
      } else {
          // If no thread exists, we can't really start one without a booking in this new model.
          // For now, let's just log or maybe show an empty state.
          console.warn('No active booking/thread found for host:', contactHostId);
          // Optional: We could trigger a "Draft Booking" creation here if we wanted "Inquiry" mode.
      }
    }
  }, [contactHostId, threads]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedThread?.messages]);

  // Mark as read when viewing
  useEffect(() => {
    if (selectedBookingId && isOpen) {
        dispatch(markThreadAsRead({ bookingId: selectedBookingId }));
    }
  }, [selectedBookingId, dispatch, isOpen, selectedThread?.messages.length]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedBookingId) return;
    
    const content = messageInput.trim();
    // 1. Send user message via API
    dispatch(sendChatMessage({ bookingId: selectedBookingId, content }));
    setMessageInput('');
  };

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

        {selectedBookingId && selectedThread ? (
          // Chat View
          <>
            {/* Chat Header */}
            <div className="p-3 border-b border-[var(--border)] flex items-center gap-3">
              <button
                onClick={() => setSelectedBookingId(null)}
                className="p-1.5 hover:bg-[var(--muted)] rounded-lg transition-colors"
                title="Back to conversations"
              >
                ←
              </button>
              <div className="flex items-center gap-2">
                  <img
                    src={selectedThread.hostPhoto}
                    alt={selectedThread.hostName}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                  <span className="font-medium">{selectedThread.hostName}</span>
              </div>
            </div>
            
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedThread.messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.senderType === 'USER' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                      msg.senderType === 'USER'
                        ? 'bg-[var(--princeton-orange)] text-white rounded-br-md'
                        : 'bg-[var(--muted)] text-[var(--foreground)] rounded-bl-md'
                    }`}
                  >
                    <p className="text-sm">{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${
                      msg.senderType === 'USER' ? 'text-white/70' : 'text-[var(--muted-foreground)]'
                    }`}>
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
            {threads.length === 0 ? (
              <div className="p-8 text-center text-[var(--muted-foreground)]">
                <p className="text-4xl mb-3">💬</p>
                <p className="font-medium">No conversations yet</p>
                <p className="text-sm mt-1">
                  Add an experience to your itinerary to start chatting with a host!
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {threads.map(thread => {
                   const lastMsg = thread.messages[thread.messages.length - 1];
                   return (
                  <button
                    key={thread.bookingId}
                    onClick={() => setSelectedBookingId(thread.bookingId)}
                    className="w-full p-4 flex items-center gap-3 hover:bg-[var(--muted)]/50 transition-colors text-left"
                  >
                    <div className="relative">
                      <img
                        src={thread.hostPhoto}
                        alt={thread.hostName}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      {thread.unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--princeton-orange)] text-white text-xs font-bold rounded-full flex items-center justify-center">
                          {thread.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-[var(--foreground)]">{thread.hostName}</span>
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {lastMsg ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--muted-foreground)] truncate">
                        {lastMsg ? lastMsg.content : 'New conversation'}
                      </p>
                    </div>
                  </button>
                   );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
