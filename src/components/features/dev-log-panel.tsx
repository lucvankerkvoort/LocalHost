'use client';

/**
 * DevLogPanel — floating dev-only log viewer.
 *
 * Shows structured log entries from the logger + intercepted fetch calls.
 * Only rendered in development (see layout.tsx).
 *
 * Keyboard shortcut: Ctrl+Shift+L (toggle open/close)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { subscribeToLogs, getLogBuffer } from '@/lib/logger';
import type { LogEntry, LogLevel } from '@/lib/logger';

type FetchEntry = {
  kind: 'fetch';
  method: string;
  url: string;
  status: number | null;
  durationMs: number | null;
  timestamp: string;
  error?: string;
};

type Entry = LogEntry | FetchEntry;

const LEVEL_STYLES: Record<LogLevel, string> = {
  debug: 'text-gray-400',
  info:  'text-blue-400',
  warn:  'text-yellow-400',
  error: 'text-red-400',
};

const LEVEL_BG: Record<LogLevel, string> = {
  debug: 'bg-gray-800',
  info:  'bg-blue-950',
  warn:  'bg-yellow-950',
  error: 'bg-red-950',
};

const STATUS_COLOR = (s: number | null) => {
  if (s === null) return 'text-gray-500';
  if (s < 300) return 'text-green-400';
  if (s < 400) return 'text-yellow-400';
  return 'text-red-400';
};

function formatTime(iso: string): string {
  return iso.slice(11, 23); // HH:MM:SS.mmm
}

export function DevLogPanel() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>(() => [...getLogBuffer()]);
  const [filter, setFilter] = useState<LogLevel | 'all' | 'fetch'>('all');
  const [search, setSearch] = useState('');
  const [pinToBottom, setPinToBottom] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to new log entries
  useEffect(() => {
    return subscribeToLogs((entry) => {
      setEntries(prev => {
        const next = [...prev, entry];
        return next.length > 500 ? next.slice(-500) : next;
      });
    });
  }, []);

  // Intercept fetch calls
  useEffect(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? 'GET').toUpperCase();
      const start = Date.now();
      let status: number | null = null;
      let error: string | undefined;

      try {
        const res = await original(input, init);
        status = res.status;
        return res;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        const entry: FetchEntry = {
          kind: 'fetch',
          method,
          url,
          status,
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
          error,
        };
        setEntries(prev => {
          const next = [...prev, entry];
          return next.length > 500 ? next.slice(-500) : next;
        });
      }
    };
    return () => { window.fetch = original; };
  }, []);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (pinToBottom && open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'instant' });
    }
  }, [entries, open, pinToBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setPinToBottom(atBottom);
  }, []);

  const clear = () => setEntries([]);

  const filtered = entries.filter(e => {
    if (filter === 'fetch') return 'kind' in e && e.kind === 'fetch';
    if (filter !== 'all' && !('kind' in e)) {
      const log = e as LogEntry;
      if (log.level !== filter) return false;
    }
    if (filter !== 'fetch' && 'kind' in e) return filter === 'all';
    if (search) {
      const text = 'kind' in e
        ? `${e.method} ${e.url}`
        : `${(e as LogEntry).namespace} ${(e as LogEntry).message}`;
      return text.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-4 left-4 z-[9999] flex items-center gap-1.5 rounded-full bg-gray-900 border border-gray-700 px-3 py-1.5 text-xs text-gray-300 shadow-lg hover:bg-gray-800 transition-colors"
        title="Dev Log Panel (Ctrl+Shift+L)"
      >
        <span className={`h-2 w-2 rounded-full ${entries.some(e => !('kind' in e) && (e as LogEntry).level === 'error') ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
        Logs
        <span className="ml-0.5 rounded bg-gray-700 px-1 text-gray-400">{entries.length}</span>
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-0 left-0 right-0 z-[9998] h-72 flex flex-col bg-gray-950 border-t border-gray-800 font-mono text-xs shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-gray-800 px-3 py-1.5 shrink-0">
            <span className="font-bold text-gray-300 mr-1">Dev Logs</span>

            {/* Level filters */}
            {(['all', 'debug', 'info', 'warn', 'error', 'fetch'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded px-2 py-0.5 transition-colors ${
                  filter === f
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {f}
              </button>
            ))}

            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search..."
              className="ml-2 flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-gray-300 placeholder-gray-600 outline-none focus:border-gray-500 max-w-xs"
            />

            <span className="text-gray-600 ml-auto">{filtered.length} entries</span>

            <button
              onClick={clear}
              className="text-gray-500 hover:text-gray-300 px-2"
              title="Clear"
            >
              clear
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-500 hover:text-gray-300 px-1"
            >
              ✕
            </button>
          </div>

          {/* Entries */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto"
          >
            {filtered.length === 0 && (
              <div className="text-gray-600 text-center mt-8">No entries</div>
            )}

            {filtered.map((entry, i) => {
              if ('kind' in entry) {
                // Fetch entry
                return (
                  <div key={i} className="flex items-center gap-2 px-3 py-0.5 hover:bg-gray-900 border-b border-gray-900">
                    <span className="text-gray-600 shrink-0 w-[88px]">{formatTime(entry.timestamp)}</span>
                    <span className="text-purple-400 shrink-0 w-[40px]">{entry.method}</span>
                    <span className={`shrink-0 w-[32px] ${STATUS_COLOR(entry.status)}`}>{entry.status ?? '—'}</span>
                    <span className="text-gray-300 truncate flex-1">{entry.url}</span>
                    {entry.durationMs !== null && (
                      <span className={`shrink-0 ${entry.durationMs > 2000 ? 'text-red-400' : entry.durationMs > 500 ? 'text-yellow-400' : 'text-gray-500'}`}>
                        {entry.durationMs}ms
                      </span>
                    )}
                    {entry.error && <span className="text-red-400 truncate max-w-[160px]">{entry.error}</span>}
                  </div>
                );
              }

              // Log entry
              const log = entry as LogEntry;
              return (
                <div key={i} className={`flex items-start gap-2 px-3 py-0.5 hover:bg-gray-900 border-b border-gray-900 ${log.level === 'error' ? LEVEL_BG[log.level] : ''}`}>
                  <span className="text-gray-600 shrink-0 w-[88px]">{formatTime(log.timestamp)}</span>
                  <span className={`shrink-0 w-[36px] uppercase ${LEVEL_STYLES[log.level]}`}>{log.level}</span>
                  <span className="text-gray-500 shrink-0 max-w-[100px] truncate">[{log.namespace}]</span>
                  {log.requestId && <span className="text-gray-600 shrink-0">#{log.requestId.slice(0, 8)}</span>}
                  <span className="text-gray-200 flex-1">{log.message}</span>
                  {log.data && Object.keys(log.data).length > 0 && (
                    <button
                      className="text-gray-600 hover:text-gray-400 shrink-0"
                      onClick={() => console.log(`[${log.namespace}] ${log.message}`, log.data)}
                      title="Log data to console"
                    >
                      {'{…}'}
                    </button>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 border-t border-gray-800 px-3 py-1 text-gray-600 shrink-0">
            <span>Ctrl+Shift+L to toggle</span>
            <button
              onClick={() => setPinToBottom(p => !p)}
              className={`ml-auto ${pinToBottom ? 'text-blue-400' : 'text-gray-600'}`}
            >
              {pinToBottom ? '⬇ pinned' : '⬇ unpinned'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
