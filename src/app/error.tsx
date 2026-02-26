"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error reporting service in production
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6 animate-fade-in">
        <div className="mx-auto w-16 h-16 rounded-full bg-[var(--destructive)]/10 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-[var(--destructive)]" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">
            Something went wrong
          </h1>
          <p className="text-[var(--muted-foreground)] text-sm leading-relaxed">
            An unexpected error occurred. Our team has been notified.
            {error.digest && (
              <span className="block mt-1 text-xs font-mono opacity-60">
                Reference: {error.digest}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--radius)] bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Try Again
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--radius)] border border-[var(--border)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--card)] transition-colors"
          >
            <Home className="w-4 h-4" />
            Go Home
          </a>
        </div>
      </div>
    </div>
  );
}
