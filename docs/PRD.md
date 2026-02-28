# Localhost Platform - Product Requirements Document

**Current Status Tracker (as of 2026-02-01)**
See [PRD Progress](#prd-progress) section at the bottom for implementation status.

---

## Executive Summary

**Localhost** is a **host-first** travel platform where itineraries are built around real local people and their experiences, not generic internet recommendations. 

The AI generates itineraries by prioritizing host-led experiences and supplementing them with essential landmarks to preserve traveler confidence and avoid fear of missing out (FOMO). Travelers can then book, rearrange, or refine their itinerary through interaction with the AI.

Localhost is not about showing travelers everything — it is about showing them the right moments to meet real people, framed within a familiar city structure.

### What Localhost is NOT
- ❌ A dating app - all interactions are activity-focused, not person-focused
- ❌ A mass tourism platform - experiences are small-scale and intimate
- ❌ A classified ads board - all hosts are verified, all experiences are curated

---

## Core Product Philosophy (Host-First Itinerary Model)

### Hosts First, Landmarks Never Lost
- Host-led experiences are the primary building blocks of itineraries.
- Canonical landmarks (e.g. Empire State Building, Eiffel Tower) are included as contextual anchors, not the core offering.
- The AI actively attempts to associate landmarks with relevant hosts.
- When no host exists, landmarks are still shown to avoid FOMO, but clearly labeled as self-guided or contextual.

This ensures:
- Travelers feel oriented and confident
- Hosts feel central, not optional
- The platform never degrades into a generic travel guide

---

## Itinerary Model

### Anchor vs Context Stops

Each itinerary item is one of two types:

1. **Anchor Experience (Host-Led)**
   - Backed by a verified local host
   - Bookable
   - Time-bound (e.g. "Afternoon", "Evening")
   - The primary reason a traveler engages with the platform

2. **Context Stop (Landmark / Free Exploration)**
   - Non-bookable
   - Provides narrative flow, orientation, and pacing
   - Included to preserve traveler expectations and city completeness
   - Can surround or lead into an Anchor Experience

### AI Itinerary Generation Flow
1. **City Skeleton**: AI identifies essential landmarks, neighborhoods, and city rhythm.
2. **Host Matching**: AI searches for hosts that occur near landmarks, naturally fit time-of-day blocks, and represent cultural depth. Hosts replace or enrich parts of the skeleton where possible.
3. **Hybrid Assembly**: Final itinerary contains Anchor Experiences as focal points and Context Stops only where hosts are unavailable/unnecessary. 
4. **Prefill, Not Finalize**: The generated itinerary is a starting point, not a commitment. The user can book hosts, rearrange items, remove landmarks, or ask the AI to refine.

The itinerary evolves through conversation, not resets.

---

## User Personas

### Traveler (Guest)
**Needs**: 
- Discover unique, off-the-beaten-path activities
- Feel safe meeting strangers in a new place
- Connect meaningfully with local culture
- Easy booking and clear expectations

### Local Host
**Needs**:
- Monetize their expertise or hospitality
- Meet interesting people from around the world
- Flexible scheduling around their life
- Protection from problematic guests

---

## Feature Requirements (Phase 1: MVP)

### 1.1 User Authentication & Profiles
- Email/password and social auth (Google, Apple)
- Profile creation with photo, bio, languages, interests
- Identity verification flow (ID check)
- Trust badges and verification indicators

### 1.2 Experience Management (Hosts)
- Create experience with structured fields (Title, Category, Location, Duration, Size, Price, What's included, Photos)
- Set availability calendar
- Manage bookings (accept/decline)
- Cancel/reschedule with policies

### 1.3 Trip Planning (Travelers)
- AI-generated host-first itinerary
- Explicit labeling of hosted vs self-guided stops
- Ability to rearrange items, remove context stops, or request AI refinements
- Book hosts directly from the itinerary

### 1.4 Booking Flow
- Select date/time from availability
- Guest count selection
- Secure payment processing
- Booking confirmation with details
- Pre-experience messaging between host and guest

### 1.5 Reviews & Trust
- Two-way reviews (host reviews guest, guest reviews experience)
- Star rating + written review
- Review moderation
- Trust score calculation

### 1.6 Messaging
- In-app messaging (no external contact sharing until confirmed)
- Message templates for common questions
- Notification system (push, email)

---

## Success Metrics

### North Star Metric
**Completed Experiences** - Number of experiences successfully completed per month

### Supporting Metrics
- % of itineraries containing ≥1 booked host experience
- Host exposure per itinerary
- Conversion rate from context stop → host booking
- User edits per itinerary (signals engagement, not friction)
- Booking conversion rate
- Host activation rate (% of signups who create experience)

### Strategic Guardrails
- The platform must never generate a trip with zero hosts unless explicitly requested
- Landmarks without hosts must never visually overpower host-led experiences
- Hosts should feel like protagonists, not ads or upsells
- The AI must explain why a host fits into a day, not just place them there

---

## Technical Requirements (Recommended Stack)

- **Frontend**: React/Next.js with TypeScript (Mobile-first PWA)
- **Styling**: TailwindCSS
- **Backend**: Next.js API routes
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: NextAuth.js
- **Payments**: Stripe Connect

---

## PRD Progress 

*Snapshot via Codebase Inspection (2026-02-01)*

### Phase 1: MVP (Core Platform)

#### 1.1 User Authentication & Profiles — Partial
- Email/password + Google auth: **Implemented** (`src/auth.ts`)
- Apple auth: **Not started**
- Profile creation with photo/bio/languages: **Partial** (UI placeholder, no edit flow)
- Identity verification flow: **Not started**
- Trust badges/verification indicators: **Partial** (UI display only)

#### 1.2 Experience Management (Hosts) — Partial
- Create experience fields: **Partial** (draft + publish flow, limited schema)
- Availability calendar: **Partial** (implemented but time-slot oriented; needs date-only alignment)
- Manage bookings (accept/decline): **Not started**
- Cancel/reschedule with policies: **Not started**

#### 1.3 Discovery & Trip Planning — Partial
- AI trip planning (itinerary builder): **Partial/strong** (`globe-itinerary.tsx`)
- Browse experiences by location: **Partial** (map/globe only, no browse page)
- Search Sort/Filters: **Not started** (components exist, not wired)
- Experience detail page with host profile: **Not started**

#### 1.4 Booking Flow — Partial
- Select date/time from availability: **Not started** (availability not connected to booking)
- Guest count selection: **Partial** (booking widget only)
- Secure payment processing: **Partial** (Stripe Connect wired, not stable)
- Booking confirmation with details: **Partial**
- Pre-experience messaging: **Partial** (`p2p-chat-slice.ts`)

#### 1.5 Reviews & Trust — Not started / UI only
- Two-way reviews: **Not started** (schema present, no flow)
- Star rating + written review UI: **Partial** (component only)

#### 1.6 Messaging — Partial
- In-app messaging: **Partial** (booking-based messaging exists)

#### Notes / Known Gaps
- Availability is currently time-slot oriented but product direction is date-only.
- Stripe Connect is wired but currently failing (reported). Needs investigation.
- Traveler-facing experience detail and browse pages are missing.
