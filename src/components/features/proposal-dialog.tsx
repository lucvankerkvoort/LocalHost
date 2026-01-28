'use client';

import { useState } from 'react';

interface ProposalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (message: string) => void;
  hostName: string;
  experienceTitle: string;
}

export function ProposalDialog({
  isOpen,
  onClose,
  onConfirm,
  hostName,
  experienceTitle,
}: ProposalDialogProps) {
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div 
        className="bg-[var(--background)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)] bg-[var(--muted)]/20">
          <h3 className="font-semibold text-lg">Message {hostName}</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            Regarding: {experienceTitle}
          </p>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Introduce yourself and ask about availability
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Hi ${hostName}, I'd love to book this experience! needed...`}
              className="w-full h-32 px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] focus:ring-2 focus:ring-[var(--princeton-orange)] focus:border-transparent resize-none"
              autoFocus
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)] flex justify-end gap-2 bg-[var(--muted)]/20">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium hover:bg-[var(--muted)] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(message)}
            disabled={!message.trim()}
            className="px-4 py-2 text-sm font-medium bg-[var(--princeton-orange)] text-white rounded-lg hover:bg-[var(--princeton-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send & Add to Trip
          </button>
        </div>
      </div>
    </div>
  );
}
