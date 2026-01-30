'use client';

import { CreateTripModal } from './create-trip-modal';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center border-2 border-dashed border-white/10 rounded-2xl bg-white/5">
      <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-6">
        <span className="text-4xl opacity-50">🌍</span>
      </div>
      <h3 className="text-xl font-bold text-white mb-2">No trips yet</h3>
      <p className="text-gray-400 max-w-sm mb-8">
        It looks like you haven't started planning any adventures. Create your first trip to get started.
      </p>
      
      <CreateTripModal>
        <button className="bg-amber-500 hover:bg-amber-600 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center shadow-lg shadow-amber-900/20">
            <span className="mr-2">✨</span>
            Create New Trip
        </button>
      </CreateTripModal>
    </div>
  );
}
