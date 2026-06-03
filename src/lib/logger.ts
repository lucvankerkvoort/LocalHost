/**
 * Structured logger — works on both server (Node) and client (browser).
 *
 * Server: structured JSON to stdout, readable in Vercel / terminal.
 * Client: colored, grouped output in DevTools console.
 *
 * Usage:
 *   const log = logger('booking');
 *   log.info('Creating booking', { userId, experienceId });
 *   log.error('Failed', { error });
 *
 * Levels (lowest → highest): debug < info < warn < error
 * Set LOG_LEVEL env var to control minimum level (default: 'debug' in dev, 'info' in prod).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogEntry = {
  level: LogLevel;
  namespace: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
};

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const CLIENT_COLORS: Record<LogLevel, string> = {
  debug: 'color:#6b7280;font-weight:normal',
  info:  'color:#2563eb;font-weight:bold',
  warn:  'color:#d97706;font-weight:bold',
  error: 'color:#dc2626;font-weight:bold',
};

const CLIENT_LABEL_COLORS: Record<LogLevel, string> = {
  debug: 'background:#f3f4f6;color:#6b7280;padding:1px 4px;border-radius:3px;font-size:11px',
  info:  'background:#dbeafe;color:#1d4ed8;padding:1px 4px;border-radius:3px;font-size:11px',
  warn:  'background:#fef3c7;color:#b45309;padding:1px 4px;border-radius:3px;font-size:11px',
  error: 'background:#fee2e2;color:#b91c1c;padding:1px 4px;border-radius:3px;font-size:11px',
};

function getMinLevel(): number {
  const raw = typeof process !== 'undefined'
    ? (process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'))
    : 'debug';
  return LEVELS[raw as LogLevel] ?? LEVELS.debug;
}

function isServer(): boolean {
  return typeof window === 'undefined';
}

// In-memory ring buffer for the browser dev panel (client only, last 200 entries)
const CLIENT_LOG_BUFFER: LogEntry[] = [];
const MAX_BUFFER = 200;

export function getLogBuffer(): readonly LogEntry[] {
  return CLIENT_LOG_BUFFER;
}

// Listeners for the dev panel to subscribe to new entries
type LogListener = (entry: LogEntry) => void;
const listeners: Set<LogListener> = new Set();

export function subscribeToLogs(fn: LogListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(entry: LogEntry): void {
  if (!isServer()) {
    CLIENT_LOG_BUFFER.push(entry);
    if (CLIENT_LOG_BUFFER.length > MAX_BUFFER) CLIENT_LOG_BUFFER.shift();
    listeners.forEach(fn => fn(entry));
  }
}

function writeServer(entry: LogEntry): void {
  // Structured JSON — Vercel / any log aggregator can parse this
  const line = JSON.stringify({
    t: entry.timestamp,
    lvl: entry.level,
    ns: entry.namespace,
    msg: entry.message,
    ...(entry.requestId ? { reqId: entry.requestId } : {}),
    ...(entry.data ? { data: entry.data } : {}),
  });

  if (entry.level === 'error' || entry.level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

function writeClient(entry: LogEntry): void {
  const { level, namespace, message, data, requestId } = entry;
  const label = `%c${level.toUpperCase()}%c [${namespace}]${requestId ? ` #${requestId.slice(0, 8)}` : ''}`;
  const styles = [CLIENT_LABEL_COLORS[level], CLIENT_COLORS[level]];

  if (data && Object.keys(data).length > 0) {
    console.groupCollapsed(`${label} ${message}`, ...styles);
    console.log(data);
    console.groupEnd();
  } else {
    const fn = level === 'error' ? console.error
               : level === 'warn' ? console.warn
               : level === 'debug' ? console.debug
               : console.info;
    fn(`${label} ${message}`, ...styles);
  }
}

// Thread-local request ID storage (server only, via AsyncLocalStorage)
let _asyncLocalStorage: { getStore: () => { requestId?: string } | undefined } | null = null;

if (isServer()) {
  // Lazy-import to avoid bundling AsyncLocalStorage on client
  import('async_hooks').then(({ AsyncLocalStorage }) => {
    _asyncLocalStorage = new AsyncLocalStorage<{ requestId?: string }>();
  }).catch(() => {
    // Not available in all environments — fine, requestId just won't propagate
  });
}

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  if (_asyncLocalStorage) {
    return (_asyncLocalStorage as import('async_hooks').AsyncLocalStorage<{ requestId: string }>)
      .run({ requestId }, fn);
  }
  return fn();
}

function getCurrentRequestId(): string | undefined {
  return _asyncLocalStorage?.getStore()?.requestId;
}

function createEntry(
  level: LogLevel,
  namespace: string,
  message: string,
  data?: Record<string, unknown>,
): LogEntry {
  return {
    level,
    namespace,
    message,
    data,
    timestamp: new Date().toISOString(),
    requestId: getCurrentRequestId(),
  };
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  child(subNamespace: string): Logger;
}

export function logger(namespace: string): Logger {
  const minLevel = getMinLevel();

  function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LEVELS[level] < minLevel) return;
    const entry = createEntry(level, namespace, message, data);
    if (isServer()) {
      writeServer(entry);
    } else {
      writeClient(entry);
      emit(entry);
    }
  }

  return {
    debug: (msg, data) => log('debug', msg, data),
    info:  (msg, data) => log('info', msg, data),
    warn:  (msg, data) => log('warn', msg, data),
    error: (msg, data) => log('error', msg, data),
    child: (sub) => logger(`${namespace}:${sub}`),
  };
}
