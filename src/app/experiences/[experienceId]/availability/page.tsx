'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Trash2, Sparkles } from 'lucide-react';

type AvailabilitySlot = {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  spotsLeft: number | null;
  timezone: string | null;
};

type OwnershipStatus = 'loading' | 'owner' | 'not-owner' | 'publish-required';

export default function ExperienceAvailabilityPage() {
  const params = useParams<{ experienceId: string }>();
  const router = useRouter();
  const experienceId = params?.experienceId as string;

  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [ownershipStatus, setOwnershipStatus] = useState<OwnershipStatus>('loading');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [spotsLeft, setSpotsLeft] = useState('');
  const [timezone, setTimezone] = useState('');
  const [weekdays, setWeekdays] = useState<Record<string, boolean>>({
    Mon: true,
    Tue: true,
    Wed: true,
    Thu: true,
    Fri: true,
    Sat: false,
    Sun: false,
  });

  const formattedSlots = useMemo(() => {
    return slots.map((slot) => ({
      ...slot,
      dateLabel: slot.date.split('T')[0],
    }));
  }, [slots]);

  const loadAvailability = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/host/availability?experienceId=${encodeURIComponent(experienceId)}`);
      if (res.status === 403) {
        setOwnershipStatus('not-owner');
        return;
      }
      if (res.status === 409) {
        // Experience needs to be published first
        setOwnershipStatus('publish-required');
        return;
      }
      if (res.status === 404) {
        setOwnershipStatus('not-owner');
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setOwnershipStatus('owner');
        setSlots(data.availability || []);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (experienceId) {
      loadAvailability();
    }
  }, [experienceId]);

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rangeStart || !rangeEnd) return;

    setIsSaving(true);
    try {
      const startDate = new Date(`${rangeStart}T00:00:00.000Z`);
      const endDate = new Date(`${rangeEnd}T00:00:00.000Z`);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw new Error('Invalid date range');
      }
      if (startDate > endDate) {
        throw new Error('Start date must be before end date');
      }

      const activeWeekdays = new Set(
        Object.entries(weekdays)
          .filter(([, value]) => value)
          .map(([key]) => key)
      );

      const weekdayMap: Record<number, string> = {
        0: 'Sun',
        1: 'Mon',
        2: 'Tue',
        3: 'Wed',
        4: 'Thu',
        5: 'Fri',
        6: 'Sat',
      };

      // Generate date-only list
      const dates: string[] = [];

      const cursor = new Date(startDate);
      while (cursor <= endDate) {
        const weekdayKey = weekdayMap[cursor.getUTCDay()];
        if (activeWeekdays.size === 0 || activeWeekdays.has(weekdayKey)) {
          dates.push(cursor.toISOString().split('T')[0]);
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      if (dates.length === 0) {
        throw new Error('No dates matched your range/weekday selection');
      }

      const res = await fetch('/api/host/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experienceId,
          dates,
          spotsLeft: spotsLeft ? Number(spotsLeft) : null,
          timezone: timezone || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save availability');
      }

      setRangeStart('');
      setRangeEnd('');
      setSpotsLeft('');
      setTimezone('');
      await loadAvailability();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save availability');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this slot?')) return;
    const res = await fetch('/api/host/availability', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });

    if (res.ok) {
      setSlots((prev) => prev.filter((slot) => slot.id !== id));
    }
  };

  // Ownership gate: show friendly message if not the owner
  if (ownershipStatus === 'not-owner') {
    return (
      <div className="min-h-screen bg-[var(--background)] pb-24">
        <div className="max-w-xl mx-auto px-6 pt-12">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="mt-12 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8 text-amber-600" />
            </div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">This isn&apos;t your experience</h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-2 mb-6">
              Only the host can edit availability.
            </p>
            <button
              onClick={() => router.push('/experiences')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--princeton-orange)] text-white font-medium text-sm hover:bg-[var(--princeton-dark)]"
            >
              Back to My Experiences
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Publish-required gate: show friendly message to publish first
  if (ownershipStatus === 'publish-required') {
    return (
      <div className="min-h-screen bg-[var(--background)] pb-24">
        <div className="max-w-xl mx-auto px-6 pt-12">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="mt-12 text-center">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Publish your experience first</h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-2 mb-6">
              You can set availability after publishing your experience.
            </p>
            <button
              onClick={() => router.push('/experiences')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--princeton-orange)] text-white font-medium text-sm hover:bg-[var(--princeton-dark)]"
            >
              Back to My Experiences
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] pb-24">
      <div className="max-w-xl mx-auto px-6 pt-12">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="mt-6 mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--princeton-orange)]/10 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-[var(--princeton-orange)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Availability</h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              Set which dates you&apos;re available to host.
            </p>
          </div>
        </div>

        <form onSubmit={handleAddSlot} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Add available dates</h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Select a date range and which days of the week.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('send-chat-message', {
                    detail: 'Help me set availability for this experience. Suggest good time slots and days.',
                  })
                );
              }}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Ask AI
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="text-sm font-medium">
              Start date
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="text-sm font-medium">
              End date
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                required
              />
            </label>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Days of week</div>
            <div className="grid grid-cols-7 gap-2">
              {Object.keys(weekdays).map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setWeekdays((prev) => ({ ...prev, [day]: !prev[day] }))}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium ${
                    weekdays[day]
                      ? 'border-[var(--blue-green)] bg-[var(--sky-blue-lighter)]/40'
                      : 'border-[var(--border)] text-[var(--muted-foreground)]'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          {/* Time slots removed — date-only availability */}

          <div className="grid grid-cols-2 gap-4">
            <label className="text-sm font-medium">
              Spots left (optional)
              <input
                type="number"
                min={1}
                value={spotsLeft}
                onChange={(e) => setSpotsLeft(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium">
              Timezone (optional)
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="e.g. Europe/Rome"
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-lg bg-[var(--princeton-orange)] text-white py-2 text-sm font-medium hover:bg-[var(--princeton-dark)] disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Add availability'}
          </button>
        </form>

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-3">
            Current slots
          </h2>
          {isLoading ? (
            <div className="text-sm text-[var(--muted-foreground)]">Loading...</div>
          ) : formattedSlots.length === 0 ? (
            <div className="text-sm text-[var(--muted-foreground)]">No availability yet.</div>
          ) : (
            <div className="space-y-3">
              {formattedSlots.map((slot) => (
                <div
                  key={slot.id}
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white/80 px-4 py-3 text-sm"
                >
                  <div>
                    <div className="font-medium">{slot.dateLabel}</div>
                    <div className="text-[var(--muted-foreground)] flex items-center gap-2 mt-1">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {slot.startTime && slot.endTime
                          ? `${slot.startTime}–${slot.endTime}`
                          : 'All day'}
                        {slot.spotsLeft ? ` • ${slot.spotsLeft} spots` : ''}
                        {slot.timezone ? ` • ${slot.timezone}` : ''}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(slot.id)}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
