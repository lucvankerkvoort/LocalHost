'use client';

import { useEffect, useRef } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setCity, updateDraft, selectHostCreation } from '@/store/host-creation-slice';
import type { HostCreationState } from '@/store/host-creation-slice';
import {
  applyStopAppend,
  applyStopRemovalByName,
  applyStopReorderByNames,
  applyStopUpdateByName,
} from './stop-operations';

export function HostCreationToolListener() {
  const dispatch = useAppDispatch();
  const allEvents = useAppSelector((state) => state.toolCalls.events);
  const { stops } = useAppSelector(selectHostCreation);
  
  // Track processed IDs to avoid loops/duplicates
  const processedIds = useRef(new Set<string>());
  const mountTimestamp = useRef(0);

  useEffect(() => {
    if (mountTimestamp.current === 0) {
      mountTimestamp.current = Date.now();
    }

    const supportedTools = new Set([
      'updateCity',
      'addStop',
      'updateDetails',
      'completeProfile',
      'updateStopByName',
      'removeStopByName',
      'reorderStops',
    ]);

    const pendingEvents = allEvents.filter((event) => {
      if (processedIds.current.has(event.id)) return false;
      if (event.timestamp < mountTimestamp.current) return false;
      if (event.source !== 'chat') return false;
      return supportedTools.has(event.toolName);
    });
    if (pendingEvents.length === 0) return;

    let nextStops = stops;
    let stopsChanged = false;

    for (const event of pendingEvents) {
      processedIds.current.add(event.id);
      if (event.state !== 'result' || !event.result || typeof event.result !== 'object') {
        continue;
      }

      const data = event.result as Record<string, unknown>;

      switch (event.toolName) {
        case 'updateCity':
          if (
            typeof data.name === 'string' &&
            typeof data.lat === 'number' &&
            typeof data.lng === 'number'
          ) {
            dispatch(setCity({
              name: data.name,
              lat: data.lat,
              lng: data.lng,
            }));
          }
          break;

        case 'addStop':
          if (
            typeof data.name === 'string' &&
            typeof data.lat === 'number' &&
            typeof data.lng === 'number'
          ) {
            nextStops = applyStopAppend(nextStops, {
              name: data.name,
              lat: data.lat,
              lng: data.lng,
              description:
                typeof data.description === 'string' ? data.description : undefined,
            });
            stopsChanged = true;
          }
          break;

        case 'updateStopByName': {
          if (typeof data.targetName !== 'string') break;
          const mutation = applyStopUpdateByName(nextStops, {
            targetName: data.targetName,
            newName: typeof data.newName === 'string' ? data.newName : undefined,
            description:
              typeof data.description === 'string' ? data.description : undefined,
          });
          if (mutation.success) {
            nextStops = mutation.stops;
            stopsChanged = true;
          }
          break;
        }

        case 'removeStopByName': {
          if (typeof data.targetName !== 'string') break;
          const mutation = applyStopRemovalByName(nextStops, data.targetName);
          if (mutation.success) {
            nextStops = mutation.stops;
            stopsChanged = true;
          }
          break;
        }

        case 'reorderStops': {
          if (!Array.isArray(data.orderedNames)) break;
          const names = data.orderedNames.filter(
            (name): name is string => typeof name === 'string' && name.trim().length > 0
          );
          if (names.length === 0) break;
          const mutation = applyStopReorderByNames(nextStops, names);
          if (mutation.success) {
            nextStops = mutation.stops;
            stopsChanged = true;
          }
          break;
        }

        case 'updateDetails': {
          const patch: Partial<
            Pick<HostCreationState, 'title' | 'shortDesc' | 'longDesc' | 'duration'>
          > = {};
          if (typeof data.title === 'string') patch.title = data.title;
          if (typeof data.shortDesc === 'string') patch.shortDesc = data.shortDesc;
          if (typeof data.longDesc === 'string') patch.longDesc = data.longDesc;
          if (typeof data.duration === 'number') patch.duration = data.duration;
          if (Object.keys(patch).length > 0) {
            dispatch(updateDraft(patch));
          }
          break;
        }

        case 'completeProfile':
          dispatch(updateDraft({ status: 'review' }));
          break;
      }
    }

    if (stopsChanged) {
      dispatch(updateDraft({ stops: nextStops }));
    }
  }, [allEvents, dispatch, stops]);
  
  return null;
}
