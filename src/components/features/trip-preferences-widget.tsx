'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { GripHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import type { TripPreferencesPatch } from '@/app/api/trips/[tripId]/preferences/route';

const POSITION_STORAGE_KEY = 'trip-preferences-widget-position';
const DEFAULT_POSITION = { x: 0, y: 0 };

interface Position {
  x: number;
  y: number;
}

function useDraggablePanel(position: Position, onPositionChange: (pos: Position) => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, posX: position.x, posY: position.y };
    },
    [position]
  );

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: PointerEvent) => {
      if (!dragStartRef.current) return;
      onPositionChange({
        x: dragStartRef.current.posX + (e.clientX - dragStartRef.current.mouseX),
        y: dragStartRef.current.posY + (e.clientY - dragStartRef.current.mouseY),
      });
    };
    const handleUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [isDragging, onPositionChange]);

  return {
    containerRef,
    containerStyle: {
      transform: `translate(${position.x}px, ${position.y}px)`,
      transition: isDragging ? undefined : 'transform 0.1s ease',
    } as React.CSSProperties,
    dragHandleProps: { onPointerDown: handlePointerDown },
    isDragging,
  };
}

interface TripPreferences {
  startDate: string;
  endDate: string;
  durationDays: string;
  partySize: string;
  partyType: string;
  pace: string;
  budget: string;
  transportMode: string;
}

const EMPTY_PREFS: TripPreferences = {
  startDate: '',
  endDate: '',
  durationDays: '',
  partySize: '',
  partyType: '',
  pace: '',
  budget: '',
  transportMode: '',
};

interface Props {
  tripId: string;
}

export function TripPreferencesWidget({ tripId }: Props) {
  const [position, setPosition] = useState<Position>(DEFAULT_POSITION);
  const [collapsed, setCollapsed] = useState(false);
  const [prefs, setPrefs] = useState<TripPreferences>(EMPTY_PREFS);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved position
  useEffect(() => {
    try {
      const saved = localStorage.getItem(POSITION_STORAGE_KEY);
      if (saved) setPosition(JSON.parse(saved));
    } catch {
      // ignore
    }
  }, []);

  // Load initial trip preferences
  useEffect(() => {
    fetch(`/api/trips/${tripId}`)
      .then((r) => r.json())
      .then((trip) => {
        const p = typeof trip.preferences === 'object' && trip.preferences !== null ? trip.preferences as Record<string, unknown> : {};
        setPrefs({
          startDate: trip.startDate ? new Date(trip.startDate as string).toISOString().slice(0, 10) : '',
          endDate: trip.endDate ? new Date(trip.endDate as string).toISOString().slice(0, 10) : '',
          durationDays: typeof p.durationDays === 'number' ? String(p.durationDays) : '',
          partySize: typeof p.partySize === 'number' ? String(p.partySize) : '',
          partyType: typeof p.partyType === 'string' ? p.partyType : '',
          pace: typeof p.pace === 'string' ? p.pace : '',
          budget: typeof p.budget === 'string' ? p.budget : '',
          transportMode: typeof p.transportMode === 'string' ? p.transportMode : '',
        });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [tripId]);

  const handlePositionChange = useCallback((pos: Position) => {
    setPosition(pos);
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(pos));
  }, []);

  const { containerRef, containerStyle, dragHandleProps, isDragging } = useDraggablePanel(
    position,
    handlePositionChange
  );

  const patch = useCallback(
    (next: TripPreferences) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const body: TripPreferencesPatch = {};
        if (next.startDate) body.startDate = next.startDate;
        else body.startDate = null;
        if (next.endDate) body.endDate = next.endDate;
        else body.endDate = null;
        if (next.durationDays) body.durationDays = parseInt(next.durationDays, 10);
        else body.durationDays = null;
        if (next.partySize) body.partySize = parseInt(next.partySize, 10);
        else body.partySize = null;
        if (next.partyType) body.partyType = next.partyType as TripPreferencesPatch['partyType'];
        else body.partyType = null;
        if (next.pace) body.pace = next.pace as TripPreferencesPatch['pace'];
        else body.pace = null;
        if (next.budget) body.budget = next.budget as TripPreferencesPatch['budget'];
        else body.budget = null;
        if (next.transportMode) body.transportMode = next.transportMode;
        else body.transportMode = null;

        fetch(`/api/trips/${tripId}/preferences`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).catch(() => {
          // silent — non-critical background write
        });
      }, 600);
    },
    [tripId]
  );

  const update = useCallback(
    (field: keyof TripPreferences, value: string) => {
      setPrefs((prev) => {
        const next = { ...prev, [field]: value };
        patch(next);
        return next;
      });
    },
    [patch]
  );

  if (!loaded) return null;

  const labelClass = 'block text-[10px] uppercase tracking-wide text-white/50 mb-0.5';
  const inputClass =
    'w-full rounded-md bg-white/10 border border-white/15 px-2 py-1 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/40';
  const selectClass = inputClass + ' appearance-none cursor-pointer';

  return (
    <div
      ref={containerRef}
      style={{ ...containerStyle, position: 'fixed', bottom: '1.5rem', left: '1.5rem', zIndex: 40 }}
      className="w-[260px]"
    >
      {/* Drag handle / header */}
      <div
        {...dragHandleProps}
        className={`flex items-center justify-between rounded-t-xl px-3 py-2 select-none
          bg-white/10 backdrop-blur-md border border-white/15 border-b-0
          ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        <div className="flex items-center gap-1.5">
          <GripHorizontal className="h-3.5 w-3.5 text-white/40" />
          <span className="text-xs font-medium text-white/80">Trip details</span>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setCollapsed((c) => !c)}
          className="text-white/40 hover:text-white/70 transition-colors"
        >
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="rounded-b-xl bg-white/5 backdrop-blur-md border border-white/15 border-t-0 px-3 py-3 flex flex-col gap-3">
          {/* Dates */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Start date</label>
              <input
                type="date"
                value={prefs.startDate}
                onChange={(e) => update('startDate', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>End date</label>
              <input
                type="date"
                value={prefs.endDate}
                onChange={(e) => update('endDate', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Duration fallback */}
          {!prefs.startDate && !prefs.endDate && (
            <div>
              <label className={labelClass}>Duration (days)</label>
              <input
                type="number"
                min={1}
                max={60}
                placeholder="e.g. 7"
                value={prefs.durationDays}
                onChange={(e) => update('durationDays', e.target.value)}
                className={inputClass}
              />
            </div>
          )}

          {/* Party */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Travellers</label>
              <input
                type="number"
                min={1}
                max={50}
                placeholder="1"
                value={prefs.partySize}
                onChange={(e) => update('partySize', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Group type</label>
              <select
                value={prefs.partyType}
                onChange={(e) => update('partyType', e.target.value)}
                className={selectClass}
              >
                <option value="">—</option>
                <option value="solo">Solo</option>
                <option value="couple">Couple</option>
                <option value="family_with_kids">Family (kids)</option>
                <option value="family_with_elderly">Family (elderly)</option>
                <option value="group">Group</option>
              </select>
            </div>
          </div>

          {/* Pace */}
          <div>
            <label className={labelClass}>Pace</label>
            <div className="flex gap-1">
              {(['relaxed', 'balanced', 'packed'] as const).map((v) => (
                <button
                  key={v}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => update('pace', prefs.pace === v ? '' : v)}
                  className={`flex-1 rounded-md px-1.5 py-1 text-[10px] font-medium capitalize border transition-colors
                    ${prefs.pace === v
                      ? 'bg-white/25 border-white/40 text-white'
                      : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Budget */}
          <div>
            <label className={labelClass}>Budget</label>
            <div className="flex gap-1">
              {(['budget', 'mid', 'premium'] as const).map((v) => (
                <button
                  key={v}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => update('budget', prefs.budget === v ? '' : v)}
                  className={`flex-1 rounded-md px-1.5 py-1 text-[10px] font-medium capitalize border transition-colors
                    ${prefs.budget === v
                      ? 'bg-white/25 border-white/40 text-white'
                      : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Travel mode */}
          <div>
            <label className={labelClass}>Travel mode</label>
            <div className="flex gap-1">
              {(['car', 'train', 'plane', 'boat'] as const).map((v) => (
                <button
                  key={v}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => update('transportMode', prefs.transportMode === v ? '' : v)}
                  className={`flex-1 rounded-md px-1.5 py-1 text-[10px] font-medium capitalize border transition-colors
                    ${prefs.transportMode === v
                      ? 'bg-white/25 border-white/40 text-white'
                      : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
