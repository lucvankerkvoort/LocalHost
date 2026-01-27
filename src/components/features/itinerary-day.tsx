'use client';

import { useState } from 'react';
import { ItineraryDay as ItineraryDayType, ItineraryItem as ItineraryItemType } from '@/types/itinerary';
import { ItineraryItem } from './itinerary-item';

interface ItineraryDayProps {
  day: ItineraryDayType;
  onAddItem: (dayId: string) => void;
  onEditItem: (dayId: string, item: ItineraryItemType) => void;
  onDeleteItem: (dayId: string, itemId: string) => void;
  onDragStart: (e: React.DragEvent, dayId: string, item: ItineraryItemType) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, dayId: string) => void;
  onBookItem: (dayId: string, item: ItineraryItemType) => void;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function ItineraryDayColumn({
  day,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onDragStart,
  onDragOver,
  onDrop,
  onBookItem,
}: ItineraryDayProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
    onDragOver(e);
  };
  
  const handleDragLeave = () => {
    setIsDragOver(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    setIsDragOver(false);
    onDrop(e, day.id);
  };

  return (
    <div 
      className={`flex-shrink-0 w-72 bg-[var(--sky-blue-lighter)]/30 rounded-xl p-3 
                  transition-all duration-200 ${isDragOver ? 'ring-2 ring-[var(--blue-green)] bg-[var(--sky-blue-lighter)]/50' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Day Header */}
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--princeton-orange)] uppercase tracking-wide">
            Day {day.dayNumber}
          </span>
          <span className="text-xs text-[var(--muted-foreground)]">
            {day.items.length} {day.items.length === 1 ? 'item' : 'items'}
          </span>
        </div>
        <h3 className="font-semibold text-[var(--foreground)] mt-0.5">
          {formatDate(day.date)}
        </h3>
      </div>
      
      {/* Items */}
      <div className="space-y-2 min-h-[100px]">
        {day.items.length === 0 ? (
          <div className="text-center py-8 text-[var(--muted-foreground)] text-sm">
            <p>No activities yet</p>
            <p className="text-xs mt-1">Add your first item!</p>
          </div>
        ) : (
          [...day.items]
            .sort((a, b) => a.position - b.position)
            .map(item => (
              <ItineraryItem
                key={item.id}
                item={item}
                dayId={day.id}
                onEdit={(item) => onEditItem(day.id, item)}
                onDelete={onDeleteItem}
                onDragStart={onDragStart}
                onBook={onBookItem}
              />
            ))
        )}
      </div>
      
      {/* Add Item Button */}
      <button
        onClick={() => onAddItem(day.id)}
        className="mt-3 w-full py-2 px-3 rounded-lg border-2 border-dashed border-[var(--border)] 
                   text-[var(--muted-foreground)] text-sm font-medium
                   hover:border-[var(--blue-green)] hover:text-[var(--blue-green)] hover:bg-white/50
                   transition-all duration-200 flex items-center justify-center gap-1"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Item
      </button>
    </div>
  );
}
