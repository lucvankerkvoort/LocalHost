'use client';

import { useState } from 'react';

interface ImageGalleryProps {
  images: string[];
  title: string;
}

export function ImageGallery({ images, title }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Ensure we have at least one image
  const galleryImages = images.length > 0 
    ? images 
    : ['https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&h=600&fit=crop'];

  return (
    <>
      {/* Main Gallery */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 rounded-xl overflow-hidden">
        {/* Main Image */}
        <div 
          className="md:col-span-2 md:row-span-2 relative aspect-[4/3] md:aspect-auto cursor-pointer group"
          onClick={() => setIsLightboxOpen(true)}
        >
          <img
            src={galleryImages[0]}
            alt={title}
            className="w-full h-full object-cover group-hover:brightness-90 transition-all"
          />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="bg-black/50 text-white px-4 py-2 rounded-lg text-sm font-medium">
              View all photos
            </span>
          </div>
        </div>

        {/* Thumbnails */}
        {galleryImages.slice(1, 5).map((image, index) => (
          <div
            key={index}
            className="hidden md:block relative aspect-video cursor-pointer group"
            onClick={() => {
              setSelectedIndex(index + 1);
              setIsLightboxOpen(true);
            }}
          >
            <img
              src={image}
              alt={`${title} - Photo ${index + 2}`}
              className="w-full h-full object-cover group-hover:brightness-90 transition-all"
            />
            {/* Show more overlay on last thumbnail */}
            {index === 3 && galleryImages.length > 5 && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white font-semibold">
                  +{galleryImages.length - 5} more
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {isLightboxOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center">
          {/* Close button */}
          <button
            onClick={() => setIsLightboxOpen(false)}
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Previous button */}
          <button
            onClick={() => setSelectedIndex((prev) => (prev === 0 ? galleryImages.length - 1 : prev - 1))}
            className="absolute left-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Main image */}
          <div className="max-w-5xl max-h-[80vh] px-16">
            <img
              src={galleryImages[selectedIndex]}
              alt={`${title} - Photo ${selectedIndex + 1}`}
              className="max-w-full max-h-[80vh] object-contain"
            />
          </div>

          {/* Next button */}
          <button
            onClick={() => setSelectedIndex((prev) => (prev === galleryImages.length - 1 ? 0 : prev + 1))}
            className="absolute right-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Thumbnail strip */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 overflow-x-auto max-w-full px-4">
            {galleryImages.map((image, index) => (
              <button
                key={index}
                onClick={() => setSelectedIndex(index)}
                className={`flex-shrink-0 w-16 h-12 rounded overflow-hidden border-2 transition-all ${
                  index === selectedIndex ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                <img src={image} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>

          {/* Counter */}
          <div className="absolute top-4 left-4 text-white text-sm">
            {selectedIndex + 1} / {galleryImages.length}
          </div>
        </div>
      )}
    </>
  );
}
