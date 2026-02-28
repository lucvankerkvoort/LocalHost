'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { ReduxProvider } from '@/store/provider';
import { ToolNavigationListener } from '@/components/tool-navigation-listener';
import { OrchestratorJobListener } from '@/components/orchestrator-job-listener';
import { ItineraryUpdateListener } from '@/components/itinerary-update-listener';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <ReduxProvider>
        {children}
        <ToolNavigationListener />
        <OrchestratorJobListener />
        <ItineraryUpdateListener />
      </ReduxProvider>
    </SessionProvider>
  );
}
