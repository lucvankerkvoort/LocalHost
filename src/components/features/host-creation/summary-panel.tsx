'use client';

import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectHostCreation, updateDraft } from '@/store/host-creation-slice';
import { useRouter } from 'next/navigation';
import { saveExperienceDraft } from '@/actions/experiences';

interface SummaryPanelProps {
  draftId?: string;
}

export function SummaryPanel({ draftId }: SummaryPanelProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [isPublishing, setIsPublishing] = useState(false);
  const { city, stops, title, shortDesc, longDesc, duration, status } = useAppSelector(selectHostCreation);
  
  // Mock host info for MVP
  const host = {
    name: 'Luc V.',
    photo: 'https://i.pravatar.cc/150?u=luc',
  };

  const handlePublish = async () => {
    if (!draftId) return;
    
    try {
      setIsPublishing(true);
      
      // Force save first to avoid race conditions with auto-save
      const saveResult = await saveExperienceDraft(draftId, {
        title: title || undefined,
        shortDesc: shortDesc || undefined,
        longDesc: longDesc || undefined,
        city: city || undefined,
        duration: duration || undefined,
        stops: stops,
        sections: { stops }
      });

      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Failed to sync draft before publishing');
      }

      // Now publish
      const response = await fetch('/api/host/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to publish');
      }

      // Success! Redirect to Experience Dashboard
      router.push('/experiences');
    } catch (error) {
      console.error('Publish error:', error);
      alert(error instanceof Error ? error.message : 'Failed to publish experience');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="w-full min-w-[320px] h-full bg-[var(--background)] border-r border-[var(--border)] overflow-y-auto flex flex-col pointer-events-auto">
      {/* Header */}
      <div className="p-6 border-b border-[var(--border)]">
        <h1 className="text-xl font-bold mb-1">Become a Host</h1>
        <p className="text-sm text-[var(--muted-foreground)]">Create your experience</p>
      </div>

      <div className="flex-1 p-6 space-y-8">
        
        {/* 1. Host Info */}
        <section>
          <h3 className="text-xs uppercase tracking-wide font-semibold text-[var(--muted-foreground)] mb-3">Host</h3>
          <div className="flex items-center gap-3">
            <img src={host.photo} alt={host.name} className="w-10 h-10 rounded-full object-cover border border-[var(--border)]" />
            <span className="font-medium">{host.name}</span>
          </div>
        </section>

        {/* 2. City */}
        <section>
          <h3 className="text-xs uppercase tracking-wide font-semibold text-[var(--muted-foreground)] mb-3">City</h3>
          {city ? (
            <div className="px-4 py-3 bg-[var(--card)] rounded-xl border border-[var(--border)] font-medium">
              📍 {city}
            </div>
          ) : (
            <div className="px-4 py-3 bg-[var(--muted)]/20 rounded-xl border border-dashed border-[var(--border)] text-[var(--muted-foreground)] text-sm italic">
              Pending selection...
            </div>
          )}
        </section>

        {/* 3. Stops */}
        <section>
          <h3 className="text-xs uppercase tracking-wide font-semibold text-[var(--muted-foreground)] mb-3">Stops ({stops.length})</h3>
          
          {stops.length > 0 ? (
            <div className="space-y-2 relative">
              {/* Connecting line */}
              <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-[var(--border)] -z-10" />
              
              {stops.map((stop, idx) => (
                <div key={stop.id} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--princeton-orange)] text-white flex items-center justify-center text-sm font-bold shadow-sm">
                    {idx + 1}
                  </div>
                  <div className="flex-1 px-3 py-2 bg-[var(--card)] rounded-lg border border-[var(--border)] shadow-sm">
                    <p className="font-medium text-sm">{stop.name}</p>
                    {stop.description && (
                      <p className="text-xs text-[var(--muted-foreground)] mt-1">{stop.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-3 bg-[var(--muted)]/20 rounded-xl border border-dashed border-[var(--border)] text-[var(--muted-foreground)] text-sm italic">
              No stops added yet
            </div>
          )}
        </section>

      
      {/* ... City ... */}
      
      {/* ... Stops ... */}
      
      {/* 4. Details / Draft */}
      <section className={status === 'draft' ? 'opacity-50' : ''}>
        <h3 className="text-xs uppercase tracking-wide font-semibold text-[var(--muted-foreground)] mb-3">Experience Details</h3>
        
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--muted-foreground)] block mb-1">Title</label>
            <input 
              type="text"
              value={title || ''}
              onChange={(e) => dispatch(updateDraft({ title: e.target.value }))}
              placeholder="e.g. Hidden Jazz Clubs of Tokyo"
              className="w-full px-3 py-2 bg-[var(--card)] rounded-lg border border-[var(--border)] text-sm focus:ring-2 focus:ring-[var(--princeton-orange)] focus:border-transparent outline-none transition-all placeholder:text-[var(--muted-foreground)]/50"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--muted-foreground)] block mb-1">Short Description</label>
            <textarea 
              value={shortDesc || ''}
              onChange={(e) => dispatch(updateDraft({ shortDesc: e.target.value }))}
              placeholder="A brief hook for your experience..."
              className="w-full px-3 py-2 bg-[var(--card)] rounded-lg border border-[var(--border)] text-sm min-h-[60px] focus:ring-2 focus:ring-[var(--princeton-orange)] focus:border-transparent outline-none transition-all placeholder:text-[var(--muted-foreground)]/50 resize-y"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--muted-foreground)] block mb-1">Full Description</label>
            <textarea 
              value={longDesc || ''}
              onChange={(e) => dispatch(updateDraft({ longDesc: e.target.value }))}
              placeholder="Tell the full story of what guests will do..."
              className="w-full px-3 py-2 bg-[var(--card)] rounded-lg border border-[var(--border)] text-sm min-h-[100px] focus:ring-2 focus:ring-[var(--princeton-orange)] focus:border-transparent outline-none transition-all placeholder:text-[var(--muted-foreground)]/50 resize-y"
            />
          </div>
          
          <div>
            <label className="text-xs font-medium text-[var(--muted-foreground)] block mb-1">Duration (mins)</label>
            <input
              type="number"
              value={duration || ''}
              onChange={(e) => dispatch(updateDraft({ duration: parseInt(e.target.value) || 0 }))}
              placeholder="e.g. 180"
              className="w-full px-3 py-2 bg-[var(--card)] rounded-lg border border-[var(--border)] text-sm focus:ring-2 focus:ring-[var(--princeton-orange)] focus:border-transparent outline-none transition-all placeholder:text-[var(--muted-foreground)]/50"
            />
          </div>
        </div>
      </section>

      </div>

      {/* Footer / CTA */}
      <div className="p-4 border-t border-[var(--border)] bg-[var(--background)]">
        <button
          disabled={status === 'draft' || stops.length === 0 || isPublishing || !draftId}
          className="w-full py-3 bg-[var(--princeton-orange)] text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-[var(--princeton-dark)] transition-colors shadow-lg flex items-center justify-center gap-2"
          onClick={handlePublish}
        >
          {isPublishing ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Publishing...
            </>
          ) : (
            'Review & Publish'
          )}
        </button>
      </div>
    </div>
  );
}
