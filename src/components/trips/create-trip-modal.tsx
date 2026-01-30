'use client';

import { useState, ReactNode } from 'react';
import { createTrip } from '@/actions/trips';
import { useRouter } from 'next/navigation';

export function CreateTripModal({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
        title: formData.get('title') as string,
        city: formData.get('city') as string,
        // startDate and endDate are optional/omitted for MVP creation flow simplicity
    };

    const res = await createTrip(data);

    if (res.success && res.tripId) {
        setIsOpen(false);
        router.push(`/trips/${res.tripId}`);
    } else {
        alert('Failed to create trip');
        setIsLoading(false);
    }
  }

  return (
    <>
      <div onClick={() => setIsOpen(true)}>
        {children}
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1a1f2e] border border-white/10 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-white/5 flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">Create New Trip</h2>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="city" className="block text-sm font-medium text-gray-300 mb-1">
                  Where are you going?
                </label>
                <input
                  type="text"
                  name="city"
                  id="city"
                  required
                  placeholder="e.g. Paris, Tokyo, New York"
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-1">
                  Trip Name <span className="text-gray-500 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  name="title"
                  id="title"
                  placeholder="e.g. Summer Vacation 2025"
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-medium py-2 px-6 rounded-lg transition-colors shadow-lg shadow-amber-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Creating...' : 'Start Planning'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
