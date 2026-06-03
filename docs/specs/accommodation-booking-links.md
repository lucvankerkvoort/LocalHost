# Spec: Accommodation Links / External Booking (Feature #6)

**Branch:** `feat/accommodation-booking-links`
**Scope:** Option A (no schema change) + groundwork for Option B

---

## One-sentence summary

When a user taps a `LODGING` itinerary item, show a modal with pre-filled Booking.com and Airbnb deep-links that open in a new tab.

---

## Layers touched

| Layer | File | Change |
|---|---|---|
| UI — item card | `src/components/features/itinerary-day.tsx` | Detect `LODGING` type; render "Find accommodation" CTA and pass `onFindAccommodation` callback |
| UI — new modal | `src/components/features/accommodation-links-modal.tsx` | New component — deep-link modal |
| UI — wiring | `src/components/features/globe-itinerary.tsx` | Handle `onFindAccommodation`, pass day date + next-day date + partySize into modal |
| Types | `src/types/itinerary.ts` | No change (Option A) |

No Prisma schema change, no API route, no Redux change for Option A.

---

## Data available at the call site

When `onFindAccommodation(item, day)` fires inside `globe-itinerary.tsx`:

| Value | Source |
|---|---|
| `city` | `item.place?.city \|\| item.location \|\| day.name` |
| `checkin` | `day.date` (already on `GlobeDestination`) |
| `checkout` | `destinations[dayIndex + 1]?.date \|\| nextCalendarDay(day.date)` |
| `numAdults` | Not in Redux globe state today → **default to 2** for Option A; pass as prop in Option B once #1 (trip preferences) ships |

---

## URL patterns

### Booking.com
```
https://www.booking.com/search.html
  ?ss={city}
  &checkin={YYYY-MM-DD}
  &checkout={YYYY-MM-DD}
  &group_adults={numAdults}
  &no_rooms=1
```

### Airbnb
```
https://www.airbnb.com/s/{city}/homes
  ?checkin={YYYY-MM-DD}
  &checkout={YYYY-MM-DD}
  &adults={numAdults}
```

Both URLs are constructed client-side from known data — no network call, no API key.

---

## Component design: `AccommodationLinksModal`

Props:
```ts
interface AccommodationLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
  city: string;
  checkin: string;      // YYYY-MM-DD
  checkout: string;     // YYYY-MM-DD
  numAdults: number;    // defaults to 2
  lodgingTitle?: string;
}
```

Renders:
- Modal header: "Find a place to stay in {city}"
- Two large buttons: Booking.com and Airbnb, each opening in a new tab with `rel="noopener noreferrer"`
- Sub-copy: "Dates: {checkin} → {checkout} · {numAdults} guest(s)"
- Close button / backdrop click to dismiss
- No network calls, no state mutations

---

## Changes to `itinerary-day.tsx`

1. Add `onFindAccommodation?: (item: ItineraryItemType) => void` to `ItineraryDayProps`.
2. Inside the activity map, when `item.type === 'LODGING'`:
   - Render a `"Find accommodation →"` button in the card footer (same hover-reveal area as other actions).
   - Call `onFindAccommodation?.(item)` on click.
3. No change to non-LODGING item rendering.

---

## Changes to `globe-itinerary.tsx`

1. Add `useState` for modal: `accommodationTarget: { item, dayIndex } | null`.
2. Add handler `handleFindAccommodation(item, dayId)`:
   - Find the day in `destinations` by id, record its index.
   - Open modal state.
3. Derive `checkout` from `destinations[dayIndex + 1]?.date` or `nextCalendarDay(day.date)`.
4. Pass `onFindAccommodation` down to `ItineraryDayColumn`.
5. Render `<AccommodationLinksModal>` at the bottom of the component tree.

---

## GOTCHAS

- `itinerary-item.tsx` (the drag-and-drop builder variant) also exists. It already has `onBook` wired for hosted experiences. **Do not add lodging links there** — that component is only used in the legacy `ItineraryBuilder` which is not the live trip view. Only `itinerary-day.tsx` (used inside `globe-itinerary.tsx`) needs the change.
- `day.date` on `GlobeDestination` is typed `date?: string` (optional). Guard against undefined: if missing, omit checkin/checkout params.
- All deep-link URLs are constructed entirely client-side — no risk of server-side URL injection.
- `rel="noopener noreferrer"` is required on all `target="_blank"` links.

---

## Option B groundwork (deferred, no code now)

When feature #1 (trip preferences) ships, `partySize` will be persisted per trip. At that point:
- Pass real `partySize` from Redux (or trip API response) into the modal.
- Optionally add `bookingUrl?: string` field to `ItineraryItem` and let the AI pre-fill it via a new `updateLodgingBookingUrl` tool.

---

## Definition of Done

- [ ] `AccommodationLinksModal` component renders with correct deep links for given inputs.
- [ ] "Find accommodation →" button appears on hover for `LODGING` items in the live trip view (`globe-itinerary.tsx`).
- [ ] Button does **not** appear for non-LODGING item types.
- [ ] Both Booking.com and Airbnb links open in a new tab with correct parameters.
- [ ] No TypeScript `any`, no `console.log` in production paths.
- [ ] No Prisma or Redux changes.
- [ ] E2E Playwright test: tap a LODGING item → modal opens → verify both link `href` values contain correct city and dates.
