'use client';

import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setP2PChatOpen, closeContactHost } from '@/store/ui-slice';
import { P2PChatPanel } from '@/components/features/p2p-chat-panel';
import { ContactHostDialog } from '@/components/features/contact-host-dialog';
import { selectAllHosts, selectHostsInitialized, fetchHosts } from '@/store/hosts-slice';

export function GlobalUI() {
  const dispatch = useAppDispatch();
  const { isP2PChatOpen, contactHostId, contactExperienceId } = useAppSelector((state) => state.ui);
  const allHosts = useAppSelector(selectAllHosts);
  const initialized = useAppSelector(selectHostsInitialized);

  // Load hosts from API on mount (static + DB-backed)
  useEffect(() => {
    if (!initialized) {
      dispatch(fetchHosts());
    }
  }, [dispatch, initialized]);

  const host = contactHostId ? allHosts.find(h => h.id === contactHostId) : null;
  const experience = host && contactExperienceId 
    ? host.experiences.find(e => e.id === contactExperienceId) 
    : host?.experiences[0]; // Fallback to first experience if none specified

  const handleSendContact = (message: string) => {
    console.log(`[GlobalUI] Sending message to ${host?.name}: ${message}`);
    // In a real app, this would send an API request
    // Then open the P2P chat
    dispatch(closeContactHost());
    dispatch(setP2PChatOpen(true));
  };

  return (
    <>
      <P2PChatPanel 
        isOpen={isP2PChatOpen} 
        onClose={() => dispatch(setP2PChatOpen(false))} 
      />
      
      {host && experience && (
        <ContactHostDialog 
          isOpen={!!contactHostId} 
          onClose={() => dispatch(closeContactHost())}
          host={host}
          experience={experience}
          onSend={handleSendContact}
        />
      )}
    </>
  );
}
