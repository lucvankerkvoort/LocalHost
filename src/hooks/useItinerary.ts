'use client';

import { useState, useCallback } from 'react';
import { 
  Itinerary, 
  ItineraryItem, 
  ItineraryItemType,
  createItinerary as createNewItinerary,
  createItem,
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
  const [itinerary, setItinerary] = useState<Itinerary | null>(() =>
    initialId ? getItineraryById(initialId) : null
  );
  const [allItineraries, setAllItineraries] = useState<Itinerary[]>(() =>
    getStoredItineraries()
  );
  const [isLoading] = useState(false);

  // Auto-save when itinerary changes
  // REMOVED: Side-effect based saving caused synchronous setState warnings.
  // We now explicitly call persistItinerary in mutators.

  // Helper to save current state and update list
  const persistItinerary = useCallback((newItinerary: Itinerary) => {
    saveItinerary(newItinerary);
    setItinerary(newItinerary);
    // Optimistically update list or fetch fresh
    setAllItineraries(getStoredItineraries());
  }, []);

  const createItinerary = useCallback((
    title: string, 
    destination: string, 
    startDate: string, 
    endDate: string
  ): Itinerary => {
    const newItinerary = createNewItinerary(title, destination, startDate, endDate);
    persistItinerary(newItinerary);
    return newItinerary;
  }, [persistItinerary]);

  const loadItinerary = useCallback((id: string) => {
    const stored = getItineraryById(id);
    setItinerary(stored);
  }, []);


  
  // WAIT. The previous implementation used functional updates to avoid dependency on 'itinerary'.
  // If I use 'itinerary' state directly, I add a dependency.
  // let's rewrite mutators to use current 'itinerary' from closure and add it to dependency.
  
  const addItem = useCallback((
    dayId: string, 
    type: ItineraryItemType, 
    title: string,
    options?: Partial<ItineraryItem>
  ) => {
    if (!itinerary) return;
    
    const newItinerary = {
        ...itinerary,
        days: itinerary.days.map(day => {
          if (day.id !== dayId) return day;
          const newPosition = day.items.length;
          const newItem = createItem(type, title, newPosition, options);
          return { ...day, items: [...day.items, newItem] };
        }),
    };
    persistItinerary(newItinerary);
  }, [itinerary, persistItinerary]);

  const updateItem = useCallback((dayId: string, itemId: string, updates: Partial<ItineraryItem>) => {
    if (!itinerary) return;
    const newItinerary = {
        ...itinerary,
        days: itinerary.days.map(day => {
          if (day.id !== dayId) return day;
          return {
            ...day,
            items: day.items.map(item => item.id === itemId ? { ...item, ...updates } : item),
          };
        }),
    };
    persistItinerary(newItinerary);
  }, [itinerary, persistItinerary]);

  const deleteItem = useCallback((dayId: string, itemId: string) => {
    if (!itinerary) return;
    const newItinerary = {
        ...itinerary,
        days: itinerary.days.map(day => {
          if (day.id !== dayId) return day;
          const filteredItems = day.items.filter(item => item.id !== itemId);
          return {
            ...day,
            items: filteredItems.map((item, index) => ({ ...item, position: index })),
          };
        }),
    };
    persistItinerary(newItinerary);
  }, [itinerary, persistItinerary]);

  const reorderItem = useCallback((
    fromDayId: string, 
    toDayId: string, 
    itemId: string, 
    newPosition: number
  ) => {
     if (!itinerary) return;
      let movedItem: ItineraryItem | null = null;
      const updatedDays = itinerary.days.map(day => {
        if (day.id !== fromDayId) return day;
        const item = day.items.find(i => i.id === itemId);
        if (item) movedItem = { ...item };
        const filteredItems = day.items.filter(i => i.id !== itemId);
        return { ...day, items: filteredItems.map((entry, index) => ({ ...entry, position: index })) };
      });
      
      if (!movedItem) return;
      const moved = movedItem as ItineraryItem;

      const finalDays = updatedDays.map(day => {
        if (day.id !== toDayId) return day;
        const items = [...day.items];
        const insertAt = Math.min(Math.max(0, newPosition), items.length);
        const inserted: ItineraryItem = { ...moved, position: insertAt };
        items.splice(insertAt, 0, inserted);
        return { ...day, items: items.map((entry, index) => ({ ...entry, position: index })) };
      });

      persistItinerary({ ...itinerary, days: finalDays });
  }, [itinerary, persistItinerary]);

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
