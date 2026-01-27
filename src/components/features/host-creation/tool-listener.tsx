'use client';

import { useEffect, useRef } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setCity, addStop, updateDraft } from '@/store/host-creation-slice';

import { useRouter } from 'next/navigation';

export function HostCreationToolListener() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const latestEvents = useAppSelector((state) => state.toolCalls.latestByTool);
  
  // Track processed IDs to avoid loops/duplicates
  const processedIds = useRef(new Set<string>());

  useEffect(() => {
    // List of tools we care about
    const tools = ['updateCity', 'addStop', 'updateDetails', 'completeProfile'];
    
    // Debug: Log what we're receiving
    console.log('[HostCreationToolListener] latestEvents:', latestEvents);
    
    tools.forEach(toolName => {
      const event = latestEvents[toolName];
      if (!event) return;
      
      console.log(`[HostCreationToolListener] Event for ${toolName}:`, {
        id: event.id,
        state: event.state,
        params: event.params,
        result: event.result,
        processed: processedIds.current.has(event.id),
      });
      
      if (processedIds.current.has(event.id)) return;
      
      // Extract data from either params (for 'call' state) or result (for 'result' state)
      // When tools have execute functions, the data comes back in the result
      let data: any = null;
      
      if (event.state === 'call' && event.params) {
        data = event.params;
      } else if (event.state === 'result' && event.result) {
        // The execute function returns { success: true, ...data }
        data = event.result;
      }
      
      if (!data) {
        console.log(`[HostCreationToolListener] No data for ${toolName}, skipping`);
        return;
      }
      
      console.log(`[HostCreationToolListener] Processing ${toolName} with data:`, data);
      
      switch (toolName) {
        case 'updateCity':
          if (data.name && data.lat && data.lng) {
            console.log('[HostCreationToolListener] Dispatching setCity:', data);
            dispatch(setCity({
              name: data.name,
              lat: data.lat,
              lng: data.lng
            }));
          }
          break;
          
        case 'addStop':
          if (data.name && data.lat && data.lng) {
            console.log('[HostCreationToolListener] Dispatching addStop:', data);
            dispatch(addStop({
              id: crypto.randomUUID(),
              name: data.name,
              lat: data.lat,
              lng: data.lng,
              description: data.description,
              order: Date.now()
            }));
          }
          break;
          
        case 'updateDetails':
          console.log('[HostCreationToolListener] Dispatching updateDraft:', data);
          dispatch(updateDraft(data));
          break;

        case 'completeProfile':
          console.log('[HostCreationToolListener] Profile complete! Navigating to profile...');
          dispatch(updateDraft({ status: 'review' }));
          setTimeout(() => {
            router.push('/profile');
          }, 500);
          break;
      }
      
      // Mark as processed
      processedIds.current.add(event.id);
    });
    
  }, [latestEvents, dispatch]);
  
  return null;
}
