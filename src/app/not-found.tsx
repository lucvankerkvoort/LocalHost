import { MapPin, Home, Search } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6 animate-fade-in">
        <div className="mx-auto w-16 h-16 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
          <MapPin className="w-8 h-8 text-[var(--primary)]" />
        </div>

        <div className="space-y-2">
          <h1 className="text-5xl font-bold text-[var(--foreground)]">404</h1>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">
            Page not found
          </h2>
          <p className="text-[var(--muted-foreground)] text-sm leading-relaxed">
            Looks like this destination doesn&apos;t exist on our map. Let&apos;s get you back on track.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--radius)] bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Home className="w-4 h-4" />
            Back to Home
          </Link>
          <Link
            href="/experiences"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--radius)] border border-[var(--border)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--card)] transition-colors"
          >
            <Search className="w-4 h-4" />
            Browse Experiences
          </Link>
        </div>
      </div>
    </div>
  );
}
