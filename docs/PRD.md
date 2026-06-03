# Product Requirements Document

## AI Travel App — MVP

**Version:** 1.0  
**Status:** Draft  
**Audience:** Engineering, Design, Product (Solo Founder)  
**Last Updated:** March 2026

---

## 1. Overview

### 1.1 Product Summary

An AI-powered travel application that generates personalized itineraries and connects travelers with local hosts offering unique experiences. The platform features a 3D interactive globe UI, conversational AI itinerary creation, a host experience builder, and integrated booking with payments.

### 1.2 Problem Statement

Planning meaningful travel is fragmented and time-consuming. Travelers cobble together itineraries from multiple sources, and local hosts offering unique experiences have no dedicated platform to surface their offerings within a planning context. General-purpose AI tools can suggest itineraries but cannot connect them to real bookable experiences.

### 1.3 Solution

A vertically integrated travel platform where:

- Travelers use a conversational AI to generate rich, globe-visualized itineraries
- Hosts create and publish experiences that are surfaced directly within AI-generated plans
- End-to-end booking and payment is handled natively in-product

---

## 2. Goals & Success Metrics

### 2.1 MVP Goals

| Goal                 | Description                                                                           |
| -------------------- | ------------------------------------------------------------------------------------- |
| Core loop validation | A traveler can go from zero to a booked experience in a single session                |
| Host activation      | Hosts can onboard, create an experience, and receive a payment                        |
| AI itinerary quality | Generated itineraries include relevant host experiences, not just generic suggestions |
| Payment reliability  | Stripe Connect handles host payouts end-to-end with no manual intervention            |

### 2.2 Key Metrics (MVP Launch Targets)

- End-to-end booking completion rate > 0% (any successful booking = MVP pass)
- Itinerary generation success rate ≥ 95% (no crashes, valid output)
- Host onboarding to first published experience < 10 minutes
- Stripe Connect activation rate for onboarded hosts ≥ 80%

---

## 3. Users & Personas

### 3.1 Traveler

**Who:** Independently-minded traveler, 25–45, plans their own trips, values authentic local experiences over packaged tours.

**Goals:**

- Plan a trip quickly without context-switching across 10 tabs
- Discover experiences they wouldn't find on mainstream platforms
- Book directly with confidence (secure payment, clear details)

**Pain Points:**

- Generic AI travel suggestions with no bookable output
- Difficulty finding local hosts/guides outside major tourist circuits

### 3.2 Host

**Who:** Local guide, activity operator, or experience creator. May be a solo individual or small business.

**Goals:**

- Surface their experience to travelers actively in planning mode
- Get paid reliably without a high-friction ops setup

**Pain Points:**

- Existing platforms charge high commissions or require large inventory
- No way to appear in AI-generated travel suggestions

---

## 4. MVP Feature Scope

### 4.1 In Scope

#### AI Itinerary Creation

- Conversational interface to generate a multi-day itinerary from natural language input (destination, dates, interests, travel style)
- Itinerary stored as structured data (days → activities/destinations) in the database
- Support for AI-driven itinerary updates (e.g., "add a cooking class on day 2")
- Each itinerary item includes location metadata for globe rendering

#### 3D Globe Visualization

- Interactive Cesium/Resium globe rendering itinerary destinations as pins/markers
- Camera flies to relevant destinations on itinerary load or update
- Basic click interaction on pins to surface destination details

#### Host Experience Builder

- Host dashboard to create, edit, and publish experiences
- Experience fields: title, description, location, duration, price, availability, images
- Drafted/published state management
- Host profile page (basic)

#### Host Surfacing in Itineraries

- AI itinerary generation logic queries for relevant published host experiences by destination
- Matched host experiences are embedded within itinerary day cards
- Traveler can view host experience detail from within the itinerary

#### Host–Traveler Chat

- In-app messaging between a traveler and host scoped to a specific experience
- Initiated from the experience detail view within an itinerary
- Basic thread UI, no real-time requirement for MVP (polling acceptable)

#### Booking & Payments (Stripe Connect)

- Traveler can book a host experience from within the itinerary
- Stripe Connect onboarding flow for hosts (Express account)
- Payment collected from traveler, platform fee deducted, remainder routed to host
- Booking confirmation state reflected in itinerary and host dashboard

#### Image System

- Multi-tier image fallback chain for destination imagery: Wikimedia → Unsplash → Pexels
- Coordinate-based geo search for relevant images
- Dual-layer caching (in-memory + DB) to minimize redundant API calls

### 4.2 Out of Scope (MVP)

- Social features (trip journals, discovery feed, shareable itineraries)
- Host profile SEO pages
- Mobile native app (web-responsive only)
- Reviews and ratings
- Group bookings or split payments
- Advanced recommendation engine (CLIP embeddings, engagement feedback loop)
- Real-time chat (WebSockets)
- Multi-currency support

---

## 5. Technical Architecture

### 5.1 Stack

| Layer            | Technology                                                   |
| ---------------- | ------------------------------------------------------------ |
| Frontend         | React / Next.js (App Router), TypeScript                     |
| State Management | Redux                                                        |
| 3D Globe         | Cesium / Resium                                              |
| Backend          | Next.js API routes / Server Actions                          |
| Database         | PostgreSQL via Prisma, PostGIS for spatial queries           |
| AI               | Anthropic Claude API (itinerary generation, update handling) |
| Payments         | Stripe Connect (Express)                                     |
| Image Sources    | Wikimedia Commons, Unsplash API, Pexels API                  |

### 5.2 Data Model (Key Entities)

- **User** — traveler or host account
- **Trip** — top-level container for an itinerary (belongs to traveler)
- **ItineraryDay** — a single day within a trip
- **ItineraryItem** — activity or destination within a day (linked to destination knowledge or host experience)
- **Destination** — reusable destination knowledge record (coordinates, images, metadata)
- **Experience** — host-created bookable item
- **Booking** — records a traveler booking an experience (status, Stripe payment intent)
- **Message** — chat message between traveler and host scoped to a booking/experience

### 5.3 Known Technical Risks (MVP)

| Risk                               | Description                                                                   | Mitigation                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Sequential AI update corruption    | Multiple rapid AI calls to update itinerary corrupt state and globe rendering | Serialize update calls; debounce user-triggered updates; optimistic UI with rollback                     |
| Image API rate limits              | High itinerary generation volume could exhaust free-tier image API quotas     | Aggressive caching at city/destination level; fallback chain ensures graceful degradation                |
| Stripe Connect activation drop-off | Hosts may abandon the Express onboarding flow                                 | Defer Stripe activation prompt until host is ready to publish; allow draft experiences before activation |

---

## 6. UX & Design Requirements

### 6.1 Core Flows

**Traveler — Create & Book**

1. Land on home → enter destination + travel details
2. AI generates itinerary → rendered on globe + day cards
3. Day card shows matched host experiences inline
4. Tap experience → detail modal → initiate chat or book
5. Complete Stripe checkout → booking confirmed

**Host — Onboard & Publish**

1. Sign up as host → complete basic profile
2. Create experience (form) → save as draft
3. Activate Stripe Connect → publish experience
4. Receive booking notification → fulfill experience

### 6.2 Design Principles

- **Globe-first:** The 3D globe is the hero element, not a decorative one. Every destination interaction should feel spatial and tactile.
- **AI as assistant, not oracle:** The itinerary is editable. Users should feel in control, not locked into AI output.
- **Host parity:** Host-facing UI should feel like a product, not an afterthought. Simple, clear, trustworthy.
- **Progressive disclosure:** Booking details, payment flows, and chat should surface contextually, not clutter the planning view.

---

## 7. Open Questions

| #   | Question                                                                                               | Owner       | Status |
| --- | ------------------------------------------------------------------------------------------------------ | ----------- | ------ |
| 1   | What is the platform fee percentage for MVP?                                                           | Founder     | Open   |
| 2   | Should host experiences surface in itineraries pre-booking, or only after traveler expresses interest? | Design      | Open   |
| 3   | What is the minimum viable host profile required before an experience can be published?                | Product     | Open   |
| 4   | Is polling sufficient for MVP chat, or is there a latency threshold that breaks UX?                    | Engineering | Open   |
| 5   | How should the itinerary handle destinations with zero matching host experiences?                      | Design / AI | Open   |

---

## 8. MVP Launch Checklist

- [ ] AI itinerary generation stable (no state corruption on sequential updates)
- [ ] Globe renders all itinerary destinations correctly
- [ ] Host experience creation and publishing flow complete
- [ ] Host experiences surface within relevant AI itineraries
- [ ] Host–traveler chat functional (polling)
- [ ] Stripe Connect onboarding live (not test mode)
- [ ] End-to-end booking completed at least once in production
- [ ] Image fallback chain stable with caching in place
- [ ] Basic error handling and fallback states for all AI calls
- [ ] Mobile-responsive layout for core traveler flows

---

_This document is a living reference. Update version number and status as scope changes._
