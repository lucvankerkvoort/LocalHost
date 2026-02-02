'use client';

import { MyExperience } from '@/actions/experiences';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  MapPin, 
  Clock, 
  Sparkles, 
  Calendar,
  Share2,
  Trash2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ExperienceCardProps {
  experience: MyExperience;
  onRefine?: (id: string) => void;
  onView?: (id: string) => void;
  onShare?: (id: string) => void;
  onDelete?: (id: string, type: 'DRAFT' | 'PUBLISHED') => void;
}

export function ExperienceCard({ 
  experience, 
  onRefine, 
  onView, 
  onShare,
  onDelete
}: ExperienceCardProps) {
  // Color logic for status
  const isPublished = experience.type === 'PUBLISHED';
  const badgeVariant = isPublished ? 'success' : 'warning'; 
  const badgeColor = isPublished 
    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20';

  return (
    <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm rounded-2xl border border-[var(--border)]/50 shadow-sm overflow-hidden flex flex-col">
      <div className="p-5 flex flex-col gap-3 flex-1">
        
        {/* Header: Title & Status */}
        <div className="flex justify-between items-start gap-4">
          <h3 className="font-bold text-lg text-[var(--foreground)] leading-tight line-clamp-2">
            {experience.title}
          </h3>
          <Badge 
            variant="outline" 
            className={`flex-shrink-0 border ${badgeColor}`}
          >
            {experience.statusLabel}
          </Badge>
        </div>

        {/* Location */}
        <div className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)]">
          <MapPin className="w-4 h-4 text-[var(--princeton-orange)]" />
          <span>{experience.location}</span>
        </div>

        {/* Description */}
        <p className="text-sm text-[var(--muted-foreground)] line-clamp-2">
          {experience.description}
        </p>

        {/* Date */}
        <div className="mt-auto pt-2 flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]/80">
          <Clock className="w-3.5 h-3.5" />
          <span>Updated {formatDistanceToNow(experience.updatedAt)} ago</span>
        </div>
      </div>

      {/* Action Bar */}
      <div className="border-t border-[var(--border)]/50 flex">
        <button
          onClick={() => onRefine?.(experience.id)}
          className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]/50 transition-colors"
        >
          <Sparkles className="w-4 h-4 text-[var(--princeton-orange)]" />
          Refine
        </button>
        
        <div className="w-px bg-[var(--border)]/50 my-2" />

        <button
          onClick={() => isPublished && onView?.(experience.id)}
          disabled={!isPublished}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
            isPublished 
              ? 'text-[var(--foreground)] hover:bg-[var(--muted)]/50' 
              : 'text-[var(--muted-foreground)] cursor-not-allowed opacity-50'
          }`}
          title={isPublished ? 'Manage availability' : 'Publish to enable availability'}
        >
          <Calendar className="w-4 h-4 text-[var(--blue-green)]" />
          {isPublished ? 'Availability' : 'Publish first'}
        </button>

        <div className="w-px bg-[var(--border)]/50 my-2" />

        <button
          onClick={() => onShare?.(experience.id)}
          className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]/50 transition-colors"
        >
          <Share2 className="w-4 h-4" />
          Share
        </button>

        <div className="w-px bg-[var(--border)]/50 my-2" />

        <button
          onClick={() => onDelete?.(experience.id, experience.type)}
          className="flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
