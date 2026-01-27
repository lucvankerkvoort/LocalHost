'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  ItineraryPlan,
  ItineraryDay,
  ExperienceItem,
  FillerItem,
  ExperienceStatus,
  generateId,
} from '@/types/itinerary-plan';
import { Host, HostExperience } from '@/lib/data/hosts';

// ============================================================================
// Context Types
// ============================================================================

interface ItineraryContextValue {
  // State
  plan: ItineraryPlan | null;
  selectedDayId: string | null;
  selectedAnchorId: string | null;
  
  // Plan actions
  setPlan: (plan: ItineraryPlan) => void;
  updatePlan: (updates: Partial<ItineraryPlan>) => void;
  clearPlan: () => void;
  
  // Day selection
  selectDay: (dayId: string | null) => void;
  getSelectedDay: () => ItineraryDay | null;
  
  // Anchor actions
  selectAnchor: (anchorId: string | null) => void;
  addAnchorToDay: (dayId: string, host: Host, experience: HostExperience) => void;
  updateAnchorStatus: (dayId: string, status: ExperienceStatus, failureReason?: string) => void;
  removeAnchor: (dayId: string) => void;
  
  // Filler actions
  addFiller: (dayId: string, filler: Omit<FillerItem, 'id'>) => void;
  removeFiller: (dayId: string, fillerId: string) => void;
}

const ItineraryContext = createContext<ItineraryContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface ItineraryProviderProps {
  children: ReactNode;
  initialPlan?: ItineraryPlan | null;
}

export function ItineraryProvider({ children, initialPlan = null }: ItineraryProviderProps) {
  const [plan, setPlanState] = useState<ItineraryPlan | null>(initialPlan);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);

  // Plan actions
  const setPlan = useCallback((newPlan: ItineraryPlan) => {
    setPlanState(newPlan);
    // Auto-select first day
    if (newPlan.days.length > 0) {
      setSelectedDayId(newPlan.days[0].id);
    }
  }, []);

  const updatePlan = useCallback((updates: Partial<ItineraryPlan>) => {
    setPlanState(prev => prev ? { ...prev, ...updates, updatedAt: new Date().toISOString() } : null);
  }, []);

  const clearPlan = useCallback(() => {
    setPlanState(null);
    setSelectedDayId(null);
    setSelectedAnchorId(null);
  }, []);

  // Day selection
  const selectDay = useCallback((dayId: string | null) => {
    setSelectedDayId(dayId);
    setSelectedAnchorId(null);
  }, []);

  const getSelectedDay = useCallback((): ItineraryDay | null => {
    if (!plan || !selectedDayId) return null;
    return plan.days.find(d => d.id === selectedDayId) || null;
  }, [plan, selectedDayId]);

  // Anchor selection
  const selectAnchor = useCallback((anchorId: string | null) => {
    setSelectedAnchorId(anchorId);
  }, []);

  // Add anchor (Localhost experience) to a day
  const addAnchorToDay = useCallback((dayId: string, host: Host, experience: HostExperience) => {
    setPlanState(prev => {
      if (!prev) return null;
      
      const newAnchor: ExperienceItem = {
        id: generateId(),
        experienceId: experience.id,
        hostId: host.id,
        status: 'DRAFT',
        location: {
          type: 'area',
          city: host.city,
          country: host.country,
          // Fuzzy location until booked
        },
        title: experience.title,
        description: experience.description,
        hostName: host.name,
        hostPhoto: host.photo,
        duration: experience.duration,
        price: experience.price,
        currency: 'USD',
        category: experience.category,
        rating: experience.rating,
        reviewCount: experience.reviewCount,
        photo: experience.photo,
      };
      
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        days: prev.days.map(day => 
          day.id === dayId 
            ? { ...day, anchor: newAnchor }
            : day
        ),
      };
    });
  }, []);

  // Update anchor status (DRAFT → PENDING → BOOKED/FAILED)
  const updateAnchorStatus = useCallback((dayId: string, status: ExperienceStatus, failureReason?: string) => {
    setPlanState(prev => {
      if (!prev) return null;
      
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        days: prev.days.map(day => {
          if (day.id !== dayId || !day.anchor) return day;
          
          const updatedAnchor: ExperienceItem = {
            ...day.anchor,
            status,
            failureReason: status === 'FAILED' ? failureReason : undefined,
            // Reveal location if booked
            location: status === 'BOOKED' 
              ? { ...day.anchor.location, type: 'exact' }
              : day.anchor.location,
          };
          
          return { ...day, anchor: updatedAnchor };
        }),
      };
    });
  }, []);

  // Remove anchor from day
  const removeAnchor = useCallback((dayId: string) => {
    setPlanState(prev => {
      if (!prev) return null;
      
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        days: prev.days.map(day => 
          day.id === dayId 
            ? { ...day, anchor: null }
            : day
        ),
      };
    });
    setSelectedAnchorId(null);
  }, []);

  // Filler actions
  const addFiller = useCallback((dayId: string, filler: Omit<FillerItem, 'id'>) => {
    setPlanState(prev => {
      if (!prev) return null;
      
      const newFiller: FillerItem = {
        ...filler,
        id: generateId(),
      };
      
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        days: prev.days.map(day => 
          day.id === dayId 
            ? { ...day, fillers: [...day.fillers, newFiller] }
            : day
        ),
      };
    });
  }, []);

  const removeFiller = useCallback((dayId: string, fillerId: string) => {
    setPlanState(prev => {
      if (!prev) return null;
      
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        days: prev.days.map(day => 
          day.id === dayId 
            ? { ...day, fillers: day.fillers.filter(f => f.id !== fillerId) }
            : day
        ),
      };
    });
  }, []);

  const value: ItineraryContextValue = {
    plan,
    selectedDayId,
    selectedAnchorId,
    setPlan,
    updatePlan,
    clearPlan,
    selectDay,
    getSelectedDay,
    selectAnchor,
    addAnchorToDay,
    updateAnchorStatus,
    removeAnchor,
    addFiller,
    removeFiller,
  };

  return (
    <ItineraryContext.Provider value={value}>
      {children}
    </ItineraryContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useItineraryPlan(): ItineraryContextValue {
  const context = useContext(ItineraryContext);
  if (!context) {
    throw new Error('useItineraryPlan must be used within an ItineraryProvider');
  }
  return context;
}
