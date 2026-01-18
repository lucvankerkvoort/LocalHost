'use client';

import { ItineraryItem as ItineraryItemType, ITEM_TYPE_CONFIG } from '@/types/itinerary';

interface ItineraryItemProps {
  item: ItineraryItemType;
  dayId: string;
  onEdit: (item: ItineraryItemType) => void;
  onDelete: (dayId: string, itemId: string) => void;
  onDragStart: (e: React.DragEvent, dayId: string, item: ItineraryItemType) => void;
}

export function ItineraryItem({ 
  item, 
  dayId, 
  onEdit, 
  onDelete, 
  onDragStart 
}: ItineraryItemProps) {
  const config = ITEM_TYPE_CONFIG[item.type];
  
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, dayId, item)}
      className="group bg-white rounded-lg p-3 shadow-sm border border-[var(--border)] 
                 hover:shadow-md hover:border-[var(--blue-green)] transition-all duration-200
                 cursor-grab active:cursor-grabbing"
    >
      {/* Header: Type icon + Title */}
      <div className="flex items-start gap-2">
        <span 
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-lg"
          style={{ backgroundColor: `${config.color}20` }}
        >
          {config.icon}
        </span>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-[var(--foreground)] text-sm truncate">
            {item.title}
          </h4>
          {item.location && (
            <p className="text-xs text-[var(--muted-foreground)] truncate mt-0.5">
              📍 {item.location}
            </p>
          )}
        </div>
      </div>
      
      {/* Time */}
      {(item.startTime || item.endTime) && (
        <div className="mt-2 text-xs text-[var(--muted-foreground)]">
          🕐 {item.startTime || '??:??'} - {item.endTime || '??:??'}
        </div>
      )}
      
      {/* Description preview */}
      {item.description && (
        <p className="mt-2 text-xs text-[var(--muted-foreground)] line-clamp-2">
          {item.description}
        </p>
      )}
      
      {/* Actions (visible on hover) */}
      <div className="mt-2 pt-2 border-t border-[var(--border)] flex justify-end gap-1 
                      opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(item)}
          className="p-1.5 rounded-md hover:bg-[var(--sky-blue-lighter)] text-[var(--muted-foreground)] 
                     hover:text-[var(--blue-green)] transition-colors"
          title="Edit"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={() => onDelete(dayId, item.id)}
          className="p-1.5 rounded-md hover:bg-red-50 text-[var(--muted-foreground)] 
                     hover:text-red-600 transition-colors"
          title="Delete"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
