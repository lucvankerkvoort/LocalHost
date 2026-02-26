export default function ProfileLoading() {
  return (
    <div className="flex-1 p-6 max-w-2xl mx-auto w-full space-y-8 animate-fade-in">
      {/* Avatar + name skeleton */}
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-[var(--border)] animate-pulse" />
        <div className="space-y-2">
          <div className="h-6 w-40 bg-[var(--border)] rounded-[var(--radius-sm)] animate-pulse" />
          <div className="h-4 w-28 bg-[var(--border)] rounded-[var(--radius-sm)] animate-pulse opacity-60" />
        </div>
      </div>

      {/* Profile fields skeleton */}
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-20 bg-[var(--border)] rounded-[var(--radius-sm)] animate-pulse opacity-50" />
            <div className="h-10 w-full bg-[var(--border)] rounded-[var(--radius)] animate-pulse opacity-30" />
          </div>
        ))}
      </div>
    </div>
  );
}
