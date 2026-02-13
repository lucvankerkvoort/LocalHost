'use client';

import { useState, useEffect } from 'react';
import { ItineraryItem, ItineraryItemType, ITEM_TYPE_CONFIG } from '@/types/itinerary';
import { 
  Eye,
  Sparkles,
  Utensils,
  Sun,
  Car,
  StickyNote,
  House
} from 'lucide-react';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (type: ItineraryItemType, title: string, options?: Partial<ItineraryItem>) => void;
  editingItem?: ItineraryItem | null;
}

export function AddItemModal({ isOpen, onClose, onSave, editingItem }: AddItemModalProps) {
  const [type, setType] = useState<ItineraryItemType>('SIGHT');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // Reset form when opening/editing
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (editingItem) {
      setType(editingItem.type);
      setTitle(editingItem.title);
      setDescription(editingItem.description || '');
      setLocation(editingItem.location || '');
      setStartTime(editingItem.startTime || '');
      setEndTime(editingItem.endTime || '');
    } else {
      setType('SIGHT');
      setTitle('');
      setDescription('');
      setLocation('');
      setStartTime('');
      setEndTime('');
    }
  }, [editingItem, isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSave(type, title.trim(), {
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
    });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="bg-gradient-to-r from-[var(--blue-green)] to-[var(--sky-blue-dark)] p-4 text-white">
          <h2 className="text-lg font-semibold">
            {editingItem ? 'Edit Item' : 'Add New Item'}
          </h2>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Type Selector */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Type
            </label>
            <div className="grid grid-cols-5 gap-2">
              {(Object.keys(ITEM_TYPE_CONFIG) as ItineraryItemType[]).map((itemType) => {
                const config = ITEM_TYPE_CONFIG[itemType];
                return (
                  <button
                    key={itemType}
                    type="button"
                    onClick={() => setType(itemType)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all
                              ${type === itemType 
                                ? 'border-[var(--blue-green)] bg-[var(--sky-blue-lighter)]/50' 
                                : 'border-[var(--border)] hover:border-[var(--muted)]'}`}
                  >
                    <span className="text-xl" style={{ color: config.color }}>
                      {itemType === 'SIGHT' && <Eye className="w-5 h-5" />}
                      {itemType === 'EXPERIENCE' && <Sparkles className="w-5 h-5" />}
                      {itemType === 'MEAL' && <Utensils className="w-5 h-5" />}
                      {itemType === 'FREE_TIME' && <Sun className="w-5 h-5" />}
                      {itemType === 'TRANSPORT' && <Car className="w-5 h-5" />}
                      {itemType === 'NOTE' && <StickyNote className="w-5 h-5" />}
                      {itemType === 'LODGING' && <House className="w-5 h-5" />}
                    </span>
                    <span className="text-[10px] text-[var(--muted-foreground)] leading-tight text-center">
                      {config.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Visit Senso-ji Temple"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] 
                        focus:outline-none focus:ring-2 focus:ring-[var(--blue-green)] focus:border-transparent
                        placeholder:text-[var(--muted)]"
              required
            />
          </div>
          
          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Asakusa, Tokyo"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] 
                        focus:outline-none focus:ring-2 focus:ring-[var(--blue-green)] focus:border-transparent
                        placeholder:text-[var(--muted)]"
            />
          </div>
          
          {/* Time Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] 
                          focus:outline-none focus:ring-2 focus:ring-[var(--blue-green)] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                End Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] 
                          focus:outline-none focus:ring-2 focus:ring-[var(--blue-green)] focus:border-transparent"
              />
            </div>
          </div>
          
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Notes
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any additional details..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] 
                        focus:outline-none focus:ring-2 focus:ring-[var(--blue-green)] focus:border-transparent
                        placeholder:text-[var(--muted)] resize-none"
            />
          </div>
          
          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-lg border border-[var(--border)] text-[var(--foreground)]
                        hover:bg-[var(--sky-blue-lighter)]/30 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 rounded-lg bg-[var(--princeton-orange)] text-white
                        hover:bg-[var(--princeton-dark)] transition-colors font-medium"
            >
              {editingItem ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
