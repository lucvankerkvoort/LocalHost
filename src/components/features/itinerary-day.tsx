'use client';

import { useState, useCallback } from 'react';
import { ItineraryItem as ItineraryItemType } from '@/types/itinerary';
import { DayImageCarousel } from './day-image-carousel';
import { Clock, Plus, MapPin, CheckCircle2, Trash2, GripVertical, X } from 'lucide-react';
import {
  isHostedExperienceItem,
  resolveItineraryDayCaption,
  resolveItineraryDayHeadline,
} from './itinerary-utils';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PlaceSearchInput } from './place-search-input';
import type { PlaceSearchResult } from '@/app/api/places/search/route';

type StopType = 'SIGHT' | 'MEAL' | 'NOTE' | 'FREE_TIME';

const STOP_TYPES: { value: StopType; label: string; emoji: string }[] = [
  { value: 'SIGHT', label: 'Sight', emoji: '🗺️' },
  { value: 'MEAL', label: 'Meal', emoji: '🍽️' },
  { value: 'NOTE', label: 'Note', emoji: '📝' },
  { value: 'FREE_TIME', label: 'Free time', emoji: '☀️' },
];

interface ItineraryDayProps {
  dayId: string;
  dayNumber: number;
  title?: string;
  city?: string;
  country?: string;
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
  onReorderItems?: (items: ItineraryItemType[]) => void;
  onBookItem?: (item: ItineraryItemType) => void;
  onChatItem?: (item: ItineraryItemType) => void;
  onFindAccommodation?: () => void;
  onAddStop?: (place: PlaceSearchResult, type: StopType) => void;
  /** City + country string used to bias place search, e.g. "Tokyo, Japan" */
  searchContext?: string;
}

// ============================================================================
// Sortable item wrapper
// ============================================================================

function SortableItem({
  item,
  onItemClick,
  onItemHover,
  onDeleteItem,
  onBookItem,
  onChatItem,
}: {
  item: ItineraryItemType;
  onItemClick?: (item: ItineraryItemType) => void;
  onItemHover?: (itemId: string | null) => void;
  onDeleteItem?: (itemId: string) => void;
  onBookItem?: (item: ItineraryItemType) => void;
  onChatItem?: (item: ItineraryItemType) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const isHostedExperience = isHostedExperienceItem(item);
  const isAnchor = item.type === 'MEAL' || isHostedExperience;
  const showCategory = Boolean(item.category) && (item.type !== 'EXPERIENCE' || isHostedExperience);

  return (
    <div
      ref={setNodeRef}
      style={style}
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
      <div className="flex justify-between items-start gap-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 flex-shrink-0 text-[var(--muted-foreground)]/30 hover:text-[var(--muted-foreground)] cursor-grab active:cursor-grabbing opacity-0 group-hover/card:opacity-100 transition-opacity"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isHostedExperience && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--princeton-orange)] bg-[var(--princeton-orange)]/10 px-1.5 py-0.5 rounded-sm">
                Hosted
              </span>
            )}
            {showCategory && (
              <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                {item.category?.replace('_', ' ')}
              </span>
            )}
          </div>
          <h4 className={`font-medium text-[var(--foreground)] truncate pr-6 ${isAnchor ? 'text-sm' : 'text-xs'}`}>
            {item.title.replace(/(?:^|\s)\p{L}/gu, (m) => m.toUpperCase())}
          </h4>

          {(item.place?.address || item.place?.city || item.location) && (
            <div className="flex items-center gap-1 mt-0.5 text-[10px] text-[var(--muted-foreground)]/80">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{item.place?.address || item.place?.city || item.location}</span>
            </div>
          )}

          {item.description?.trim() && (
            <p className="mt-1.5 text-xs text-[var(--muted-foreground)] line-clamp-2 leading-relaxed">
              {item.description}
            </p>
          )}

          <div className="flex items-center gap-3 mt-2 text-xs text-[var(--muted-foreground)]">
            {item.duration && (
              <span className="flex items-center gap-1 bg-[var(--muted)]/30 px-1.5 py-0.5 rounded-sm">
                <Clock className="w-3 h-3" />
                {Math.round(item.duration / 60) > 0 ? `${Math.round(item.duration / 60)}h` : `${item.duration}m`}
              </span>
            )}
            {item.place?.confidence && item.place.confidence > 0.8 && (
              <span title="Verified Location" className="text-[10px] text-green-600/70 flex items-center gap-0.5">
                <CheckCircle2 className="w-3 h-3" /> Verified
              </span>
            )}
          </div>
        </div>

        {/* Delete button — non-hosted items only */}
        {!isHostedExperience && onDeleteItem && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteItem(item.id);
            }}
            className="flex-shrink-0 mt-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity text-[var(--muted-foreground)]/50 hover:text-red-500"
            aria-label="Remove stop"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Hosted experience footer */}
      {isHostedExperience && (
        <div className="mt-3 pt-2.5 border-t border-[var(--border)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {item.hostPhoto ? (
              <img
                src={item.hostPhoto}
                alt={item.hostName ?? 'Host'}
                className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-[var(--border)]"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[var(--princeton-orange)]/20 flex items-center justify-center flex-shrink-0 text-[var(--princeton-orange)] text-xs font-bold">
                {(item.hostName ?? 'H')[0].toUpperCase()}
              </div>
            )}
            {item.hostName && (
              <span className="text-xs text-[var(--muted-foreground)] truncate">{item.hostName}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {onChatItem && (
              <button
                onClick={(e) => { e.stopPropagation(); onChatItem(item); }}
                className="px-2.5 py-1 rounded-md border border-[var(--border)] text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)]/30 transition-colors"
              >
                Chat
              </button>
            )}
            {onBookItem && (
              <button
                onClick={(e) => { e.stopPropagation(); onBookItem(item); }}
                className="px-2.5 py-1 rounded-md bg-[var(--princeton-orange)] text-white text-xs font-bold hover:bg-[var(--princeton-dark)] transition-colors"
              >
                Book
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Add Stop inline panel
// ============================================================================

function AddStopPanel({
  dayNumber,
  searchContext,
  onAddStop,
  onClose,
}: {
  dayNumber: number;
  searchContext?: string;
  onAddStop: (place: PlaceSearchResult, type: StopType) => void;
  onClose: () => void;
}) {
  const [selectedType, setSelectedType] = useState<StopType>('SIGHT');

  const handleSelect = useCallback(
    (place: PlaceSearchResult) => {
      onAddStop(place, selectedType);
      onClose();
    },
    [onAddStop, onClose, selectedType],
  );

  return (
    <div className="rounded-lg border border-[var(--princeton-orange)]/30 bg-[var(--card)] p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--foreground)]">Add stop to Day {dayNumber}</span>
        <button
          onClick={onClose}
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Type selector */}
      <div className="flex gap-1">
        {STOP_TYPES.map(({ value, label, emoji }) => (
          <button
            key={value}
            onClick={() => setSelectedType(value)}
            className={`flex-1 rounded-md px-1 py-1.5 text-[10px] font-medium border transition-colors ${
              selectedType === value
                ? 'bg-[var(--princeton-orange)]/15 border-[var(--princeton-orange)]/40 text-[var(--princeton-orange)]'
                : 'bg-transparent border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]/20'
            }`}
          >
            {emoji} {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <PlaceSearchInput
        context={searchContext}
        placeholder={`Search for a ${selectedType.toLowerCase()}…`}
        onSelect={handleSelect}
        autoFocus
      />
    </div>
  );
}

// ============================================================================
// Main day column
// ============================================================================

export function ItineraryDayColumn({
  dayId,
  dayNumber,
  title,
  city,
  country,
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
  onReorderItems,
  onBookItem,
  onChatItem,
  onFindAccommodation,
  onAddStop,
  searchContext,
}: ItineraryDayProps) {
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [localItems, setLocalItems] = useState<ItineraryItemType[]>(activities);

  // Keep local items in sync when Redux updates the activities prop
  // (e.g. after a successful POST replaces the temp item)
  if (localItems !== activities && !localItems.some((i) => i.id.startsWith('temp-'))) {
    setLocalItems(activities);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = localItems.findIndex((i) => i.id === active.id);
      const newIndex = localItems.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(localItems, oldIndex, newIndex).map((item, idx) => ({
        ...item,
        position: idx,
      }));
      setLocalItems(reordered);
      onReorderItems?.(reordered);
    },
    [localItems, onReorderItems],
  );

  const headline = resolveItineraryDayHeadline(date, title, dayNumber);
  const caption = resolveItineraryDayCaption(date, title, city, dayNumber);
  const searchCtx = searchContext ?? (city && country ? `${city}, ${country}` : city ?? '');

  return (
    <div
      data-testid="day-card"
      className={`relative pl-8 ${isActive ? 'opacity-100' : 'opacity-70 hover:opacity-100'} transition-opacity`}
    >
      {/* Timeline */}
      <div className="absolute left-[15px] top-0 bottom-0 w-px bg-[var(--border)]" />

      {/* Day Header */}
      <div className="relative mb-4 cursor-pointer group" onClick={onSelect}>
        <div
          className={`absolute -left-[39px] top-0 w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
            isActive
              ? 'bg-[var(--princeton-orange)] border-[var(--princeton-orange)] text-white'
              : 'bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)] group-hover:border-[var(--princeton-orange)]'
          }`}
        >
          {dayNumber}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-[var(--foreground)] group-hover:text-[var(--princeton-orange)] transition-colors">
            {headline}
          </span>
          <span className="text-xs text-[var(--muted-foreground)]">
            {localItems.length} Stops • {caption}
          </span>
        </div>
      </div>

      {/* City image carousel */}
      <DayImageCarousel city={city} country={country} />

      {/* Activities with drag-to-reorder */}
      <div className="space-y-3">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {localItems.map((item) => (
              <SortableItem
                key={item.id}
                item={item}
                onItemClick={onItemClick}
                onItemHover={onItemHover}
                onDeleteItem={onDeleteItem}
                onBookItem={onBookItem}
                onChatItem={onChatItem}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* Accommodation shortcut */}
        {onFindAccommodation && (
          <button
            data-testid="find-accommodation-button"
            onClick={onFindAccommodation}
            className="w-full py-2 border border-[var(--border)] rounded-lg text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--blue-green)] hover:bg-[var(--sky-blue-lighter)] transition-all flex items-center justify-center gap-1.5"
          >
            🏨 Find accommodation
          </button>
        )}

        {/* Add Stop panel / trigger */}
        {addStopOpen && onAddStop ? (
          <AddStopPanel
            dayNumber={dayNumber}
            searchContext={searchCtx}
            onAddStop={onAddStop}
            onClose={() => setAddStopOpen(false)}
          />
        ) : (
          <button
            onClick={() => (onAddStop ? setAddStopOpen(true) : onAddActivity(dayId))}
            className="w-full py-2 border-2 border-dashed border-[var(--border)] rounded-lg text-sm font-semibold text-[var(--foreground)]/80 hover:bg-[var(--secondary)]/10 hover:text-[var(--secondary)] hover:border-[var(--secondary)]/50 transition-all flex items-center justify-center gap-1"
          >
            <Plus className="w-4 h-4" /> Add stop
          </button>
        )}
      </div>
    </div>
  );
}
