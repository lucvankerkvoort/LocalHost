import Link from 'next/link';
import type { Host } from '@/lib/data/hosts';

interface HostCardProps {
  host: Host;
}

export function HostCard({ host }: HostCardProps) {
  return (
    <Link
      href={`/hosts/${host.id}`}
      className="group block bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
    >
      {/* Host Photo */}
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={host.photo}
          alt={host.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute bottom-3 left-3 right-3">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/90 backdrop-blur-sm text-sm font-medium">
            📍 {host.city}, {host.country}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="font-semibold text-xl text-[var(--foreground)] mb-2 group-hover:text-[var(--sunset-orange)] transition-colors">
          {host.name}
        </h3>
        
        {/* Quote */}
        <p className="text-[var(--muted-foreground)] text-sm italic mb-4 line-clamp-2">
          "{host.quote}"
        </p>

        {/* Interests */}
        <div className="flex flex-wrap gap-2 mb-4">
          {host.interests.slice(0, 3).map((interest) => (
            <span
              key={interest}
              className="px-2 py-1 text-xs rounded-full bg-[var(--sand-beige)] text-[var(--foreground)]"
            >
              {interest}
            </span>
          ))}
          {host.interests.length > 3 && (
            <span className="px-2 py-1 text-xs rounded-full bg-[var(--sand-beige-light)] text-[var(--muted-foreground)]">
              +{host.interests.length - 3} more
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1 text-[var(--muted-foreground)]">
            <span className="text-[var(--sunset-orange)]">★</span>
            {host.experiences.length > 0 && (
              <span className="font-medium">
                {host.experiences[0].rating} 
                <span className="text-[var(--muted)]"> ({host.experiences[0].reviewCount})</span>
              </span>
            )}
          </div>
          <span className="text-[var(--muted-foreground)]">
            {host.experiences.length} {host.experiences.length === 1 ? 'experience' : 'experiences'}
          </span>
        </div>

        {/* Action Button (Stops propagation to avoid navigation) */}
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Dispatch custom event for the chat widget to pick up
              window.dispatchEvent(new CustomEvent('send-chat-message', { detail: `I'm interested in ${host.name}. Add them to my plan as a tentative option.` }));
            }}
            className="w-full py-2 px-4 bg-[var(--sand-beige)] hover:bg-[var(--princeton-orange)] hover:text-white text-[var(--foreground)] rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
          >
            <span>📅</span>
            Add to Plan
          </button>
        </div>
      </div>
    </Link>
  );
}
