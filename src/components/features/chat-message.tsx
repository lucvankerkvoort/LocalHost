'use client';

import { cn } from '@/lib/utils';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <div
      className={cn(
        'flex w-full mb-3',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
          isUser
            ? 'bg-[var(--sunset-orange)] text-white rounded-br-md'
            : 'bg-[var(--card-background)] border border-[var(--border)] text-[var(--foreground)] rounded-bl-md'
        )}
      >
        {content}
      </div>
    </div>
  );
}
