'use client';

import { useState, useCallback } from 'react';
import { Itinerary, ItineraryItem, ItineraryItemType } from '@/types/itinerary';
import { ItineraryDayColumn } from './itinerary-day';
import { AddItemModal } from './add-item-modal';
import { MapPin, Calendar } from 'lucide-react';

interface ItineraryBuilderProps {
  itinerary: Itinerary;
  onAddItem: (dayId: string, type: ItineraryItemType, title: string, options?: Partial<ItineraryItem>) => void;
  onUpdateItem: (dayId: string, itemId: string, updates: Partial<ItineraryItem>) => void;
  onDeleteItem: (dayId: string, itemId: string) => void;
  onReorderItem: (fromDayId: string, toDayId: string, itemId: string, newPosition: number) => void;
  onDelete: () => void;
}

interface DragData {
  dayId: string;
  item: ItineraryItem;
}

export function ItineraryBuilder({
  itinerary,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onReorderItem,
  onDelete,
}: ItineraryBuilderProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<{ dayId: string; item: ItineraryItem } | null>(null);
  const [dragData, setDragData] = useState<DragData | null>(null);

  // Format dates for display
  const formatDateRange = () => {
    const start = new Date(itinerary.startDate + 'T00:00:00');
    const end = new Date(itinerary.endDate + 'T00:00:00');
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
  };

  // Drag and Drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, dayId: string, item: ItineraryItem) => {
    setDragData({ dayId, item });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.id); // Required for Firefox
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetDayId: string) => {
    e.preventDefault();
    
    if (!dragData) return;
    
    // Get drop position based on mouse position
    const targetDay = itinerary.days.find(d => d.id === targetDayId);
    const newPosition = targetDay ? targetDay.items.length : 0;
    
    onReorderItem(dragData.dayId, targetDayId, dragData.item.id, newPosition);
    setDragData(null);
  }, [dragData, itinerary.days, onReorderItem]);

  // Modal handlers
  const handleAddClick = (dayId: string) => {
    setSelectedDayId(dayId);
    setEditingItem(null);
    setIsModalOpen(true);
  };

  const handleEditClick = (dayId: string, item: ItineraryItem) => {
    setSelectedDayId(dayId);
    setEditingItem({ dayId, item });
    setIsModalOpen(true);
  };

  const handleModalSave = (type: ItineraryItemType, title: string, options?: Partial<ItineraryItem>) => {
    if (editingItem) {
      onUpdateItem(editingItem.dayId, editingItem.item.id, { type, title, ...options });
    } else if (selectedDayId) {
      onAddItem(selectedDayId, type, title, options);
    }
    setIsModalOpen(false);
    setEditingItem(null);
    setSelectedDayId(null);
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <div className="bg-white border-b border-[var(--border)] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[var(--foreground)]">
                {itinerary.title}
              </h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-[var(--muted-foreground)]">
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" /> {itinerary.destination}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" /> {formatDateRange()}
                </span>
                <span className="flex items-center gap-1">
                  {itinerary.days.length} {itinerary.days.length === 1 ? 'day' : 'days'}
                </span>
              </div>
            </div>
            <button
              onClick={onDelete}
              className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              Delete Itinerary
            </button>
          </div>
        </div>
      </div>

      {/* Days Container */}
      <div className="p-4 overflow-x-auto">
        <div className="flex gap-4 min-w-max pb-4">
          {itinerary.days.map((day) => (
            <ItineraryDayColumn
              key={day.id}
              dayId={day.id}
              dayNumber={day.dayNumber}
              date={day.date}
              activities={day.items}
              onAddActivity={() => handleAddClick(day.id)}
              onEditItem={(item) => handleEditClick(day.id, item)}
              onDeleteItem={(itemId) => onDeleteItem(day.id, itemId)}
              onBookItem={() => {}} // Booking not supported in builder yet
            />
          ))}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <AddItemModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
          setSelectedDayId(null);
        }}
        onSave={handleModalSave}
        editingItem={editingItem?.item}
      />
    </div>
  );
}
