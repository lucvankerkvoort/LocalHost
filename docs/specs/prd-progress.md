# PRD Progress Snapshot

Date: 2026-02-01
Source: docs/PRD.md
Method: Codebase inspection (no runtime verification)

Legend: Done / Partial / Not Started

## Phase 1: MVP (Core Platform)

### 1.1 User Authentication & Profiles — Partial
- Email/password + Google auth: Implemented.
  - Evidence: `src/auth.ts`, `src/app/auth/signin/page.tsx`, `src/app/auth/signup/page.tsx`
- Apple auth: Not started.
- Profile creation with photo/bio/languages/interests: Partial (UI placeholder, no edit flow).
  - Evidence: `src/app/profile/page.tsx`
- Identity verification flow: Not started.
- Trust badges/verification indicators: Partial (UI display only).
  - Evidence: `src/components/features/host-profile-card.tsx`, `src/types/index.ts`

### 1.2 Experience Management (Hosts) — Partial
- Create experience with structured fields: Partial (draft + publish flow, limited schema).
  - Evidence: `src/app/become-host/*`, `src/actions/experiences.ts`, `src/app/api/host/publish/route.ts`, `prisma/schema.prisma`
- Availability calendar: Partial (implemented but time-slot oriented; needs date-only alignment).
  - Evidence: `src/app/experiences/[experienceId]/availability/page.tsx`, `src/app/api/host/availability/route.ts`
- Manage bookings (accept/decline): Not started.
- Cancel/reschedule with policies: Not started.

### 1.3 Discovery & Search (Travelers) — Partial / Not started
- Browse experiences by location: Partial (map/globe only, no browse page).
  - Evidence: `src/app/page.tsx`, `src/components/features/globe-itinerary.tsx`
- Filters (category/date/price/group/language): Not started (components exist, not wired).
  - Evidence: `src/components/features/explore-filters.tsx`
- Sort (relevance/rating/price/distance): Not started.
- Experience detail page with host profile: Not started (no traveler-facing detail route found).
- Save/wishlist: Not started.

### 1.4 Booking Flow — Partial
- Select date/time from availability: Not started (availability not connected to booking).
- Guest count selection: Partial (booking widget only).
  - Evidence: `src/components/features/booking-widget.tsx`
- Secure payment processing: Partial (Stripe Connect wired, not stable).
  - Evidence: `src/lib/stripe/*`, `src/app/api/bookings/[bookingId]/pay/route.ts`, `src/app/api/webhooks/stripe/route.ts`
- Booking confirmation with details: Partial.
- Pre-experience messaging: Partial.
  - Evidence: `src/app/api/bookings/[bookingId]/messages/route.ts`, `src/store/p2p-chat-slice.ts`

### 1.5 Reviews & Trust — Not started / UI only
- Two-way reviews: Not started (schema present, no flow).
  - Evidence: `prisma/schema.prisma`
- Star rating + written review UI: Partial (component only).
  - Evidence: `src/components/features/reviews-section.tsx`
- Review moderation: Not started.
- Trust score calculation: Not started (constants only).

### 1.6 Messaging — Partial
- In-app messaging: Partial (booking-based messaging exists).
- Message templates: Not started.
- Notifications (push/email): Not started.

### 1.7 Safety Features — Not started
- Emergency contact share: Not started.
- Check-in/out: Not started.
- Report user/experience: Not started.
- Safety team contact: Not started.

---

## Phase 2: Enhanced Features

### 2.1 Advanced Discovery — Partial
- AI recommendations / "Surprise me": Not started (planning agent exists but not for discovery).
- Collections/curated lists: Not started.
- Map-based browsing: Partial (globe itinerary exists).

### 2.2 Social Features — Not started
- Follow hosts, share, invite friends: Not started.

### 2.3 Host Tools — Not started
- Analytics dashboard, dynamic pricing, co-hosting: Not started.
- Multi-experience management: Not supported (schema limits to 1 published experience).

### 2.4 Traveler Tools — Partial
- Trip planning (itinerary builder): Partial/strong.
  - Evidence: `src/components/features/globe-itinerary.tsx`, `src/app/trips/*`
- Group booking management: Not started.
- Loyalty/rewards: Not started.

---

## Notes / Known Gaps
- Availability is currently time-slot oriented but product direction is date-only.
- Stripe Connect is wired but currently failing (reported). Needs investigation.
- Traveler-facing experience detail and browse pages are missing.
