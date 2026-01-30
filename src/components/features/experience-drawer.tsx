'use client';

import { useState } from 'react';
import { Host, HostExperience, getHostsByCity } from '@/lib/data/hosts';
import { CATEGORY_ICONS, CATEGORY_LABELS, ExperienceCategory } from '@/types';

interface ExperienceDrawerProps {
  isOpen: boolean;
  dayId: string;
  city: string;
  onClose: () => void;
  onAddExperience: (host: Host, experience: HostExperience) => void;
}

/**
 * Slide-in drawer for browsing and adding Localhost experiences.
 * Filters by the selected day's city.
 */
export function ExperienceDrawer({
  isOpen,
  dayId,
  city,
  onClose,
  onAddExperience,
}: ExperienceDrawerProps) {
  const [selectedCategory, setSelectedCategory] = useState<ExperienceCategory | 'all'>('all');
  
  // Get hosts in this city
  const hosts = getHostsByCity(city);
  
  // Flatten all experiences with host info
  const allExperiences = hosts.flatMap(host => 
    host.experiences.map(exp => ({ host, experience: exp }))
  );
  
  // Filter by category
  const filteredExperiences = selectedCategory === 'all'
    ? allExperiences
    : allExperiences.filter(({ experience }) => experience.category === selectedCategory);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[var(--background)] z-50 shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              Find a Localhost in {city}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-[var(--muted)] rounded-lg transition-colors"
            >
              ✕
            </button>
          </div>
          
          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-[var(--princeton-orange)] text-white'
                  : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
              }`}
            >
              All
            </button>
            {(Object.entries(CATEGORY_LABELS) as [ExperienceCategory, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                  selectedCategory === key
                    ? 'bg-[var(--princeton-orange)] text-white'
                    : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
                }`}
              >
                <span>{CATEGORY_ICONS[key]}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
        
        {/* Experience List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredExperiences.length === 0 ? (
            <div className="text-center py-12 text-[var(--muted-foreground)]">
              <p className="text-lg mb-2">No experiences found in {city}</p>
              <p className="text-sm">Try a different city or category</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredExperiences.map(({ host, experience }) => (
                <div
                  key={`${host.id}-${experience.id}`}
                  className="border border-[var(--border)] rounded-xl overflow-hidden hover:shadow-lg transition-shadow"
                >
                  {/* Experience Image */}
                  <div className="h-40 bg-[var(--muted)] relative">
                    <img
                      src={experience.photos?.[0] || host.photo}
                      alt={experience.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded-full text-white text-xs flex items-center gap-1">
                      <span>{CATEGORY_ICONS[experience.category]}</span>
                      <span>{CATEGORY_LABELS[experience.category]}</span>
                    </div>
                  </div>
                  
                  {/* Content */}
                  <div className="p-3">
                    <h3 className="font-semibold text-[var(--foreground)] mb-2">
                      {experience.title}
                    </h3>
                    
                    <p className="text-sm text-[var(--muted-foreground)] line-clamp-2 mb-3">
                      {experience.description}
                    </p>
                    
                    {/* Host Info */}
                    <div className="flex items-center gap-2 mb-3">
                      <img
                        src={host.photo}
                        alt={host.name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                      <div>
                        <p className="text-sm font-medium">{host.name}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {host.city}, {host.country}
                        </p>
                      </div>
                    </div>
                    
                    {/* Meta */}
                    <div className="flex items-center justify-between mb-3 text-sm">
                      <div className="flex items-center gap-3 text-[var(--muted-foreground)]">
                        <span>⏱ {Math.floor(experience.duration / 60)}h</span>
                        <span className="flex items-center gap-1">
                          <span className="text-amber-500">★</span>
                          {experience.rating.toFixed(1)} ({experience.reviewCount})
                        </span>
                      </div>
                      <span className="font-semibold text-[var(--foreground)]">
                        ${(experience.price / 100).toFixed(0)}
                      </span>
                    </div>
                    
                    {/* CTA */}
                    <button
                      onClick={() => onAddExperience(host, experience)}
                      className="w-full py-2.5 bg-[var(--princeton-orange)] text-white font-medium rounded-lg hover:bg-[var(--princeton-dark)] transition-colors"
                    >
                      Add as Day Anchor
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
