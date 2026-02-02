'use client';

import { useState, useCallback, useEffect } from 'react';
import type { ExperienceCandidateData, CandidateStatus } from '@/components/features/experience-candidate-card';

interface ChatMessage {
  id: string;
  senderId: string;
  senderType: 'USER' | 'HOST';
  content: string;
  createdAt: string;
}

interface UseExperienceCandidatesReturn {
  candidates: ExperienceCandidateData[];
  isLoading: boolean;
  error: string | null;
  
  // CRUD operations
  addCandidate: (data: {
    hostId: string;
    experienceId: string;
    dayNumber: number;
    timeSlot?: string;
  }) => Promise<ExperienceCandidateData | null>;
  removeCandidate: (candidateId: string) => Promise<boolean>;
  updateCandidate: (candidateId: string, data: Partial<ExperienceCandidateData>) => Promise<boolean>;
  
  // Preliminary chat
  sendPreliminaryMessage: (candidateId: string, message: string) => Promise<boolean>;
  refreshCandidate: (candidateId: string) => Promise<void>;
  
  // Booking
  bookCandidate: (candidateId: string) => Promise<boolean>;
  
  // Full chat
  chatMessages: Record<string, ChatMessage[]>;
  sendChatMessage: (candidateId: string, content: string) => Promise<boolean>;
  loadChatMessages: (candidateId: string) => Promise<void>;
}

export function useExperienceCandidates(): UseExperienceCandidatesReturn {
  const [candidates, setCandidates] = useState<ExperienceCandidateData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});

  // Fetch candidates on mount
  const fetchCandidates = useCallback(async () => {
    try {
      const res = await fetch('/api/itinerary/candidates');
      if (!res.ok) return;
      const data = await res.json();
      setCandidates(data.candidates || []);
    } catch (e) {
      console.error('[useExperienceCandidates] fetch error:', e);
    }
  }, []);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  // Add a new candidate
  const addCandidate = useCallback(async (data: {
    hostId: string;
    experienceId: string;
    dayNumber: number;
    timeSlot?: string;
  }): Promise<ExperienceCandidateData | null> => {
    setError(null);
    try {
      const res = await fetch('/api/itinerary/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || 'Failed to add');
        return null;
      }
      
      const { candidate } = await res.json();
      setCandidates(prev => [...prev, candidate]);
      return candidate;
    } catch (e) {
      setError('Failed to add experience');
      return null;
    }
  }, []);

  // Remove a candidate
  const removeCandidate = useCallback(async (candidateId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/itinerary/candidates/${candidateId}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) return false;
      
      setCandidates(prev => prev.filter(c => c.id !== candidateId));
      return true;
    } catch (e) {
      return false;
    }
  }, []);

  // Update a candidate
  const updateCandidate = useCallback(async (
    candidateId: string, 
    data: Partial<ExperienceCandidateData>
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/itinerary/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) return false;
      
      const { candidate } = await res.json();
      setCandidates(prev => prev.map(c => c.id === candidateId ? candidate : c));
      return true;
    } catch (e) {
      return false;
    }
  }, []);

  // Send preliminary message
  const sendPreliminaryMessage = useCallback(async (
    candidateId: string, 
    message: string
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/chat/preliminary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId, message }),
      });
      
      if (!res.ok) return false;
      
      // Refresh the candidate to get updated status
      await fetchCandidates();
      return true;
    } catch (e) {
      return false;
    }
  }, [fetchCandidates]);

  // Refresh a single candidate
  const refreshCandidate = useCallback(async (candidateId: string) => {
    try {
      const res = await fetch(`/api/itinerary/candidates/${candidateId}`);
      if (!res.ok) return;
      
      const { candidate } = await res.json();
      setCandidates(prev => prev.map(c => c.id === candidateId ? candidate : c));
    } catch (e) {
      console.error('[refreshCandidate] error:', e);
    }
  }, []);

  // bookCandidate removed - candidates ARE bookings in TENTATIVE status
  // Payment flow uses candidateId directly as bookingId
  // This function is kept as a no-op for backwards compatibility
  const bookCandidate = useCallback(async (_candidateId: string): Promise<boolean> => {
    console.warn('[useExperienceCandidates] bookCandidate is deprecated. Candidate IS the booking.');
    return true; // No-op - candidate is already a booking
  }, []);

  // Load chat messages for a candidate
  const loadChatMessages = useCallback(async (candidateId: string) => {
    try {
      const res = await fetch(`/api/chat/${candidateId}`);
      if (!res.ok) return;
      
      const { chatThread } = await res.json();
      if (chatThread?.messages) {
        setChatMessages(prev => ({
          ...prev,
          [candidateId]: chatThread.messages,
        }));
      }
    } catch (e) {
      console.error('[loadChatMessages] error:', e);
    }
  }, []);

  // Send a chat message
  const sendChatMessage = useCallback(async (
    candidateId: string, 
    content: string
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/chat/${candidateId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      
      if (!res.ok) return false;
      
      const { message } = await res.json();
      
      // Add to local state immediately
      setChatMessages(prev => ({
        ...prev,
        [candidateId]: [...(prev[candidateId] || []), message],
      }));
      
      return true;
    } catch (e) {
      return false;
    }
  }, []);

  return {
    candidates,
    isLoading,
    error,
    addCandidate,
    removeCandidate,
    updateCandidate,
    sendPreliminaryMessage,
    refreshCandidate,
    bookCandidate,
    chatMessages,
    sendChatMessage,
    loadChatMessages,
  };
}
