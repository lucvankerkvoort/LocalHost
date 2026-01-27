'use client';

import dynamic from 'next/dynamic';

// Dynamic import for Cesium (no SSR)
const CesiumGlobe = dynamic(() => import('@/components/features/cesium-globe'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--deep-space-blue)]">
      <div className="text-white animate-pulse">Loading creation map...</div>
    </div>
  ),
});

export default CesiumGlobe;
