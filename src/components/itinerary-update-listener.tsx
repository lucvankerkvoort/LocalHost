'use client';

import { useEffect, useRef } from 'react';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchActiveTrip } from '@/store/globe-thunks';

type UpdateItineraryResult = {
  success?: boolean;
  updated?: boolean;
  tripId?: string;
};

export function ItineraryUpdateListener() {
  const dispatch = useAppDispatch();
  const latestUpdate = useAppSelector(
    (state) => state.toolCalls.lastResultsByTool.updateItinerary
  );
  const activeTripId = useAppSelector((state) => state.globe.tripId);
  const processedToolEventId = useRef<string | null>(null);

  useEffect(() => {
    const eventId = latestUpdate?.id;
    if (!eventId || processedToolEventId.current === eventId) {
      return;
    }

    const result = latestUpdate.result as UpdateItineraryResult | undefined;
    if (!result || result.success !== true || result.updated !== true) {
      return;
    }

    const targetTripId =
      typeof result.tripId === 'string' && result.tripId.trim().length > 0
        ? result.tripId
        : activeTripId;
    if (!targetTripId) {
      return;
    }

    processedToolEventId.current = eventId;
    dispatch(fetchActiveTrip(targetTripId));
  }, [activeTripId, dispatch, latestUpdate]);

  return null;
}
