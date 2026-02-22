'use client';

import { useState, ReactNode } from 'react';
import { createTrip } from '@/actions/trips';
import { useRouter } from 'next/navigation';

export function CreateTripModal({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleCreate = async () => {
    if (isLoading) return;
    setIsLoading(true);

    const res = await createTrip({});

    if (res.success && res.tripId) {
      router.push(`/trips/${res.tripId}`);
      return;
    }

    alert('Failed to create trip');
    setIsLoading(false);
  };

  return (
    <div
      onClick={handleCreate}
      role="button"
      tabIndex={0}
      aria-disabled={isLoading}
      className={isLoading ? 'opacity-60 pointer-events-none' : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleCreate();
        }
      }}
    >
      {children}
    </div>
  );
}
