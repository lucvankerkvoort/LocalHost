'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Itinerary, 
  ItineraryDay, 
  ItineraryItem, 
  ItineraryItemType,
  createItinerary as createNewItinerary,
  createItem,
  generateId 
} from '@/types/itinerary';

const STORAGE_KEY = 'localhost_itineraries';

// Get all itineraries from local storage
function getStoredItineraries(): Itinerary[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Save all itineraries to local storage
function saveItineraries(itineraries: Itinerary[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(itineraries));
}

// Get a specific itinerary by ID
function getItineraryById(id: string): Itinerary | null {
  const itineraries = getStoredItineraries();
  return itineraries.find(i => i.id === id) || null;
}

// Save a single itinerary (create or update)
function saveItinerary(itinerary: Itinerary): void {
  const itineraries = getStoredItineraries();
  const index = itineraries.findIndex(i => i.id === itinerary.id);
  
  if (index >= 0) {
    itineraries[index] = { ...itinerary, updatedAt: new Date().toISOString() };
  } else {
    itineraries.push(itinerary);
  }
  
  saveItineraries(itineraries);
}

// Delete an itinerary
function deleteItineraryFromStorage(id: string): void {
  const itineraries = getStoredItineraries();
  saveItineraries(itineraries.filter(i => i.id !== id));
}

export interface UseItineraryReturn {
  itinerary: Itinerary | null;
  isLoading: boolean;
  createItinerary: (title: string, destination: string, startDate: string, endDate: string) => Itinerary;
  loadItinerary: (id: string) => void;
  addItem: (dayId: string, type: ItineraryItemType, title: string, options?: Partial<ItineraryItem>) => void;
  updateItem: (dayId: string, itemId: string, updates: Partial<ItineraryItem>) => void;
  deleteItem: (dayId: string, itemId: string) => void;
  reorderItem: (fromDayId: string, toDayId: string, itemId: string, newPosition: number) => void;
  deleteItinerary: () => void;
  allItineraries: Itinerary[];
}

export function useItinerary(initialId?: string): UseItineraryReturn {
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [allItineraries, setAllItineraries] = useState<Itinerary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load itinerary on mount
  useEffect(() => {
    setAllItineraries(getStoredItineraries());
    if (initialId) {
      const stored = getItineraryById(initialId);
      setItinerary(stored);
    }
    setIsLoading(false);
  }, [initialId]);

  // Auto-save when itinerary changes
  useEffect(() => {
    if (itinerary) {
      saveItinerary(itinerary);
      setAllItineraries(getStoredItineraries());
    }
  }, [itinerary]);

  const createItinerary = useCallback((
    title: string, 
    destination: string, 
    startDate: string, 
    endDate: string
  ): Itinerary => {
    const newItinerary = createNewItinerary(title, destination, startDate, endDate);
    setItinerary(newItinerary);
    return newItinerary;
  }, []);

  const loadItinerary = useCallback((id: string) => {
    const stored = getItineraryById(id);
    setItinerary(stored);
  }, []);

  const addItem = useCallback((
    dayId: string, 
    type: ItineraryItemType, 
    title: string,
    options?: Partial<ItineraryItem>
  ) => {
    setItinerary(prev => {
      if (!prev) return prev;
      
      return {
        ...prev,
        days: prev.days.map(day => {
          if (day.id !== dayId) return day;
          
          const newPosition = day.items.length;
          const newItem = createItem(type, title, newPosition, options);
          
          return {
            ...day,
            items: [...day.items, newItem],
          };
        }),
      };
    });
  }, []);

  const updateItem = useCallback((dayId: string, itemId: string, updates: Partial<ItineraryItem>) => {
    setItinerary(prev => {
      if (!prev) return prev;
      
      return {
        ...prev,
        days: prev.days.map(day => {
          if (day.id !== dayId) return day;
          
          return {
            ...day,
            items: day.items.map(item => 
              item.id === itemId ? { ...item, ...updates } : item
            ),
          };
        }),
      };
    });
  }, []);

  const deleteItem = useCallback((dayId: string, itemId: string) => {
    setItinerary(prev => {
      if (!prev) return prev;
      
      return {
        ...prev,
        days: prev.days.map(day => {
          if (day.id !== dayId) return day;
          
          const filteredItems = day.items.filter(item => item.id !== itemId);
          // Re-index positions
          return {
            ...day,
            items: filteredItems.map((item, index) => ({ ...item, position: index })),
          };
        }),
      };
    });
  }, []);

  const reorderItem = useCallback((
    fromDayId: string, 
    toDayId: string, 
    itemId: string, 
    newPosition: number
  ) => {
    setItinerary(prev => {
      if (!prev) return prev;
      
      // Find the item
      let movedItem: ItineraryItem | null = null;
      
      const updatedDays = prev.days.map(day => {
        if (day.id === fromDayId) {
          const item = day.items.find(i => i.id === itemId);
          if (item) movedItem = { ...item };
          
          const filteredItems = day.items.filter(i => i.id !== itemId);
          return {
            ...day,
            items: filteredItems.map((item, index) => ({ ...item, position: index })),
          };
        }
        return day;
      });
      
      if (!movedItem) return prev;
      
      // Insert into target day
      return {
        ...prev,
        days: updatedDays.map(day => {
          if (day.id !== toDayId) return day;
          
          const items = [...day.items];
          const insertAt = Math.min(Math.max(0, newPosition), items.length);
          items.splice(insertAt, 0, { ...movedItem!, position: insertAt });
          
          // Re-index all positions
          return {
            ...day,
            items: items.map((item, index) => ({ ...item, position: index })),
          };
        }),
      };
    });
  }, []);

  const deleteItinerary = useCallback(() => {
    if (itinerary) {
      deleteItineraryFromStorage(itinerary.id);
      setItinerary(null);
      setAllItineraries(getStoredItineraries());
    }
  }, [itinerary]);

  return {
    itinerary,
    isLoading,
    createItinerary,
    loadItinerary,
    addItem,
    updateItem,
    deleteItem,
    reorderItem,
    deleteItinerary,
    allItineraries,
  };
}
