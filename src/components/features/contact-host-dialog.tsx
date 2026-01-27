'use client';

import { useState } from 'react';
import type { Host, HostExperience } from '@/lib/data/hosts';

interface ContactHostDialogProps {
  isOpen: boolean;
  onClose: () => void;
  host: Host;
  experience: HostExperience;
  dayNumber?: number;
  onSend: (message: string) => void;
}

/**
 * Dialog shown when clicking "Add to Day" - allows user to compose
 * an initial message to the localhost before adding to their plan.
 */
export function ContactHostDialog({
  isOpen,
  onClose,
  host,
  experience,
  dayNumber,
  onSend,
}: ContactHostDialogProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    
    setIsSending(true);
    try {
      await onSend(message.trim());
      setMessage('');
      onClose();
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slide-up">
        {/* Header with Experience Image */}
        <div className="relative h-32 bg-[var(--muted)]">
          <img
            src={experience.photo}
            alt={experience.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4">
            <h2 className="text-white font-semibold text-lg line-clamp-1">
              {experience.title}
            </h2>
            {dayNumber && (
              <span className="text-white/80 text-sm">Adding to Day {dayNumber}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors"
          >
            ✕
          </button>
        </div>
        
        {/* Host Info */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <img
              src={host.photo}
              alt={host.name}
              className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-md"
            />
            <div>
              <p className="font-medium text-[var(--foreground)]">{host.name}</p>
              <p className="text-sm text-[var(--muted-foreground)]">
                📍 {host.city}, {host.country}
              </p>
            </div>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Message Input */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Send a message to {host.name}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Hi ${host.name}! I'm interested in "${experience.title}"...`}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] 
                        focus:outline-none focus:ring-2 focus:ring-[var(--princeton-orange)] focus:border-transparent
                        placeholder:text-[var(--muted)] resize-none"
              autoFocus
            />
          </div>
          
          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-lg border border-[var(--border)] text-[var(--foreground)]
                        hover:bg-[var(--sky-blue-lighter)]/30 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!message.trim() || isSending}
              className="flex-1 py-2.5 px-4 rounded-lg bg-[var(--princeton-orange)] text-white
                        hover:bg-[var(--princeton-dark)] transition-colors font-medium
                        disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <span>💬</span>
                  Send & Add to Plan
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
