'use client';

import { useState } from 'react';
import { ExperienceItem, EXPERIENCE_STATUS_CONFIG } from '@/types/itinerary-plan';
import { CATEGORY_ICONS } from '@/types';
import { MapPin, Star, X, Sparkles, Clock, CheckCircle, AlertCircle } from 'lucide-react';

interface AnchorCardProps {
  anchor: ExperienceItem;
  dayNumber: number;
  isSelected: boolean;
  onSelect: () => void;
  onBook: () => void;
  onRemove: () => void;
}

/**
 * Card component displaying a Localhost experience anchor.
 * Shows status badge, host info, and booking actions.
 */
export function AnchorCard({
  anchor,
  dayNumber,
  isSelected,
  onSelect,
  onBook,
  onRemove,
}: AnchorCardProps) {
  const statusConfig = EXPERIENCE_STATUS_CONFIG[anchor.status];
  const categoryIcon = CATEGORY_ICONS[anchor.category] || '📍';
  
  return (
    <div
      onClick={onSelect}
      className={`relative rounded-xl border-2 overflow-hidden cursor-pointer transition-all ${
        isSelected
          ? 'border-[var(--princeton-orange)] shadow-lg'
          : 'border-[var(--border)] hover:border-[var(--blue-green)]'
      } ${anchor.status === 'DRAFT' ? 'opacity-70' : ''}`}
    >
      {/* Status Badge */}
      <div 
        className="absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-medium text-white flex items-center gap-1"
        style={{ backgroundColor: statusConfig.color }}
      >
        <span>
          {anchor.status === 'DRAFT' && <Sparkles className="w-3.5 h-3.5" />}
          {anchor.status === 'PENDING' && <Clock className="w-3.5 h-3.5" />}
          {anchor.status === 'BOOKED' && <CheckCircle className="w-3.5 h-3.5" />}
          {anchor.status === 'FAILED' && <AlertCircle className="w-3.5 h-3.5" />}
        </span>
        <span>{statusConfig.label}</span>
      </div>
      
      {/* Image */}
      <div className="h-32 bg-[var(--muted)] overflow-hidden">
        <img
          src={anchor.photo}
          alt={anchor.title}
          className="w-full h-full object-cover"
        />
      </div>
      
      {/* Content */}
      <div className="p-3">
        {/* Category & Duration */}
        <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] mb-1">
          <span>{categoryIcon} {anchor.category.replace('-', ' ')}</span>
          <span>•</span>
          <span>{Math.floor(anchor.duration / 60)}h {anchor.duration % 60 > 0 ? `${anchor.duration % 60}m` : ''}</span>
        </div>
        
        {/* Title */}
        <h4 className="font-semibold text-[var(--foreground)] line-clamp-2 mb-2">
          {anchor.title}
        </h4>
        
        {/* Host */}
        <div className="flex items-center gap-2 mb-3">
          <img
            src={anchor.hostPhoto}
            alt={anchor.hostName}
            className="w-6 h-6 rounded-full object-cover"
          />
          <span className="text-sm text-[var(--muted-foreground)]">
            with {anchor.hostName}
          </span>
        </div>
        
        {/* Location */}
        <div className="text-xs text-[var(--muted-foreground)] mb-3 flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5" /> 
          <span>{anchor.location.neighborhood || anchor.location.city}, {anchor.location.country}</span>
          {anchor.location.type === 'hidden' && (
            <span className="ml-1 text-amber-600">(revealed after booking)</span>
          )}
        </div>
        
        {/* Rating & Price */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 fill-current text-amber-500" />
            <span className="text-sm font-medium">{anchor.rating.toFixed(1)}</span>
            <span className="text-xs text-[var(--muted-foreground)]">
              ({anchor.reviewCount})
            </span>
          </div>
          <div className="font-semibold text-[var(--foreground)]">
            ${(anchor.price / 100).toFixed(0)}
            <span className="text-xs text-[var(--muted-foreground)] font-normal"> /person</span>
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex gap-2">
          {anchor.status === 'DRAFT' && (
            <button
              onClick={(e) => { e.stopPropagation(); onBook(); }}
              className="flex-1 py-2 px-3 bg-[var(--princeton-orange)] text-white text-sm font-medium rounded-lg hover:bg-[var(--princeton-dark)] transition-colors"
            >
              Book Now
            </button>
          )}
          {anchor.status === 'PENDING' && (
            <div className="flex-1 py-2 px-3 bg-amber-500 text-white text-sm font-medium rounded-lg text-center animate-pulse">
              Checking availability...
            </div>
          )}
          {anchor.status === 'BOOKED' && (
            <div className="flex-1 py-2 px-3 bg-green-500 text-white text-sm font-medium rounded-lg text-center">
              ✓ Confirmed
            </div>
          )}
          {anchor.status === 'FAILED' && (
            <button
              onClick={(e) => { e.stopPropagation(); onBook(); }}
              className="flex-1 py-2 px-3 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
            >
              Find Alternative
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="py-2 px-3 border border-[var(--border)] text-[var(--muted-foreground)] text-sm rounded-lg hover:bg-[var(--muted)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Failure reason */}
        {anchor.status === 'FAILED' && anchor.failureReason && (
          <p className="mt-2 text-xs text-red-500">
            {anchor.failureReason}
          </p>
        )}
      </div>
    </div>
  );
}
