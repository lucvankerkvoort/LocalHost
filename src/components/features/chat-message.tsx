'use client';

import ReactMarkdown from 'react-markdown';
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
            ? 'bg-[var(--princeton-orange)] text-white rounded-br-md'
            : 'bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] rounded-bl-md'
        )}
      >
        {isUser ? (
          content
        ) : (
          <ReactMarkdown
            components={{
              // Style headings to be smaller and fit chat context
              h1: ({ children }) => (
                <h1 className="text-base font-bold mt-2 mb-1 first:mt-0">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-sm font-bold mt-2 mb-1 first:mt-0">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-sm font-semibold mt-1.5 mb-0.5 first:mt-0">{children}</h3>
              ),
              h4: ({ children }) => (
                <h4 className="text-sm font-medium mt-1 mb-0.5 first:mt-0">{children}</h4>
              ),
              // Paragraphs with proper spacing
              p: ({ children }) => (
                <p className="mb-2 last:mb-0">{children}</p>
              ),
              // Styled lists
              ul: ({ children }) => (
                <ul className="list-disc list-inside mb-2 last:mb-0 space-y-0.5">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-inside mb-2 last:mb-0 space-y-0.5">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="text-sm">{children}</li>
              ),
              // Inline code styling
              code: ({ children, className }) => {
                const isInline = !className;
                return isInline ? (
                  <code className="bg-[var(--muted)]/20 px-1 py-0.5 rounded text-xs font-mono">
                    {children}
                  </code>
                ) : (
                  <code className="block bg-[var(--muted)]/20 p-2 rounded text-xs font-mono overflow-x-auto my-1">
                    {children}
                  </code>
                );
              },
              // Code blocks
              pre: ({ children }) => (
                <pre className="bg-[var(--muted)]/20 p-2 rounded text-xs font-mono overflow-x-auto my-2">
                  {children}
                </pre>
              ),
              // Bold and italic
              strong: ({ children }) => (
                <strong className="font-semibold">{children}</strong>
              ),
              em: ({ children }) => (
                <em className="italic">{children}</em>
              ),
              // Links
              a: ({ children, href }) => (
                <a 
                  href={href} 
                  className="text-[var(--blue-green)] hover:underline font-medium"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              ),
              // Blockquotes
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-[var(--muted)] pl-2 my-1 italic opacity-90">
                  {children}
                </blockquote>
              ),
              // Horizontal rules
              hr: () => (
                <hr className="my-2 border-[var(--border)]" />
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}
