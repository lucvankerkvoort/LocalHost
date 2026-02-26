export default function TripsLoading() {
  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6 animate-fade-in">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-48 bg-[var(--border)] rounded-[var(--radius-sm)] animate-pulse" />
        <div className="h-4 w-72 bg-[var(--border)] rounded-[var(--radius-sm)] animate-pulse opacity-60" />
      </div>

      {/* Trip cards skeleton */}
      <div className="grid gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5 space-y-3"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-[var(--border)] animate-pulse" />
              <div className="space-y-1.5 flex-1">
                <div className="h-5 w-40 bg-[var(--border)] rounded-[var(--radius-sm)] animate-pulse" />
                <div className="h-3 w-24 bg-[var(--border)] rounded-[var(--radius-sm)] animate-pulse opacity-60" />
              </div>
            </div>
            <div className="h-4 w-full bg-[var(--border)] rounded-[var(--radius-sm)] animate-pulse opacity-40" />
            <div className="h-4 w-3/4 bg-[var(--border)] rounded-[var(--radius-sm)] animate-pulse opacity-30" />
          </div>
        ))}
      </div>
    </div>
  );
}
