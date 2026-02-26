export default function ExperiencesLoading() {
  return (
    <div className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6 animate-fade-in">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-56 bg-[var(--border)] rounded-[var(--radius-sm)] animate-pulse" />
        <div className="h-4 w-80 bg-[var(--border)] rounded-[var(--radius-sm)] animate-pulse opacity-60" />
      </div>

      {/* Experience cards grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] overflow-hidden"
          >
            <div className="aspect-[4/3] bg-[var(--border)] animate-pulse" />
            <div className="p-4 space-y-2">
              <div className="h-5 w-3/4 bg-[var(--border)] rounded-[var(--radius-sm)] animate-pulse" />
              <div className="h-3 w-1/2 bg-[var(--border)] rounded-[var(--radius-sm)] animate-pulse opacity-60" />
              <div className="h-3 w-1/3 bg-[var(--border)] rounded-[var(--radius-sm)] animate-pulse opacity-40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
