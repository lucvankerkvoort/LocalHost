'use client';

import { ItineraryItem as ItineraryItemType } from '@/types/itinerary';
import { Clock, Plus } from 'lucide-react';
import {
  isHostedExperienceItem,
  resolveItineraryDayCaption,
  resolveItineraryDayHeadline,
} from './itinerary-utils';

interface ItineraryDayProps {
  dayId: string;
  dayNumber: number;
  title?: string;
  city?: string;
  date?: string;
  activities: ItineraryItemType[];
  isSpaceOptimized?: boolean;
  isActive?: boolean;
  
  onAddActivity: (dayId: string) => void;
  onSelect?: () => void;
  onItemClick?: (item: ItineraryItemType) => void;
  onItemHover?: (itemId: string | null) => void;
  onEditItem?: (item: ItineraryItemType) => void;
  onDeleteItem?: (itemId: string) => void;
  onBookItem?: (item: ItineraryItemType) => void;
}

export function ItineraryDayColumn({
  dayId,
  dayNumber,
  title,
  city,
  date,
  activities = [],
  isSpaceOptimized = false,
  isActive = false,
  onAddActivity,
  onSelect,
  onItemClick,
  onItemHover,
  onEditItem,
  onDeleteItem,
  onBookItem,
}: ItineraryDayProps) {
  const headline = resolveItineraryDayHeadline(date, title, dayNumber);
  const caption = resolveItineraryDayCaption(date, title, city, dayNumber);
  
  return (
    <div 
      data-testid="day-card"
      className={`relative pl-8 ${isActive ? 'opacity-100' : 'opacity-70 hover:opacity-100'} transition-opacity`}
    >
      {/* Timeline Line */}
      <div className="absolute left-[15px] top-0 bottom-0 w-px bg-[var(--border)]" />
      
      {/* Day Header */}
      <div 
        className="relative mb-4 cursor-pointer group"
        onClick={onSelect}
      >
        <div className={`absolute -left-[39px] top-0 w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
           isActive 
             ? 'bg-[var(--princeton-orange)] border-[var(--princeton-orange)] text-white' 
             : 'bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)] group-hover:border-[var(--princeton-orange)]'
        }`}>
           {dayNumber}
        </div>
        
        <div className="flex flex-col">
            <span className="text-sm font-bold text-[var(--foreground)] group-hover:text-[var(--princeton-orange)] transition-colors">
                {headline}
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">
                {activities.length} Stops • {caption}
            </span>
        </div>
      </div>
      
      {/* Activities List */}
      <div className="space-y-3">
        {activities.map((item) => {
            const isHostedExperience = isHostedExperienceItem(item);
            const isAnchor = item.type === 'MEAL' || isHostedExperience;
            const showCategory = Boolean(item.category) && (item.type !== 'EXPERIENCE' || isHostedExperience);
            
            return (
            <div 
                key={item.id}
                data-item-id={item.id}
                className={`group/card relative rounded-lg p-3 transition-all cursor-pointer border shadow-sm ${
                    isAnchor 
                        ? 'bg-[var(--card)] hover:bg-[var(--muted)]/10 border-l-4 border-l-[var(--princeton-orange)] border-y-[var(--border)] border-r-[var(--border)]' 
                        : 'bg-[var(--card)]/80 hover:bg-[var(--card)] border-[var(--border)] opacity-80 hover:opacity-100'
                }`}
                onClick={(e) => {
                    e.stopPropagation();
                    onItemClick?.(item);
                }}
                onMouseEnter={() => onItemHover?.(item.id)}
                onMouseLeave={() => onItemHover?.(null)}
            >
                <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            {isHostedExperience && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--princeton-orange)] bg-[var(--princeton-orange)]/10 px-1.5 py-0.5 rounded-sm">
                                    Hosted
                                </span>
                            )}
                            {showCategory && (
                                <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                                    {item.category.replace('_', ' ')}
                                </span>
                            )}
                        </div>
                        <h4 className={`font-medium text-[var(--foreground)] truncate pr-6 ${isAnchor ? 'text-sm' : 'text-xs'}`}>
                            {item.title}
                        </h4>
                        {item.description?.trim() && (
                            <p className="mt-1 text-xs text-[var(--muted-foreground)] line-clamp-2">
                                {item.description}
                            </p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-xs text-[var(--muted-foreground)]">
                       {item.duration && (
                               <span className="flex items-center gap-1">
                                   <Clock className="w-3 h-3" />
                                   {Math.round(item.duration / 60) > 0 ? `${Math.round(item.duration / 60)}h` : `${item.duration}m`}
                               </span>
                           )}
                        </div>
                    </div>
                </div>
                
                 {/* Actions (hover only) */}
                <div className="absolute top-2 right-2 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center gap-1">
                     {onBookItem && isHostedExperience && (
                         <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                onBookItem(item);
                            }}
                            className="px-2 py-1 rounded-md bg-[var(--princeton-orange)] text-white text-xs font-bold hover:bg-[var(--princeton-dark)]"
                            title="Book Experience"
                         >
                            Book
                         </button>
                     )}
                </div>
            </div>
            );
        })}
        
        {/* Add Item Placeholder */}
        <button
            onClick={() => onAddActivity(dayId)}
            className="w-full py-2 border-2 border-dashed border-[var(--border)] rounded-lg text-sm font-semibold text-[var(--foreground)]/80 hover:bg-[var(--secondary)]/10 hover:text-[var(--secondary)] hover:border-[var(--secondary)]/50 transition-all flex items-center justify-center gap-1"
        >
            <Plus className="w-4 h-4" /> Add to Day {dayNumber}
        </button>
      </div>
    </div>
  );
}
