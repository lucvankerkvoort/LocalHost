Localhost Platform – PRD (Revised: Host-First Itinerary Model)

Executive Summary (Updated)

Localhost is a host-first travel platform where itineraries are built around real local people and their experiences, not generic internet recommendations.

The AI generates itineraries by prioritizing host-led experiences and supplementing them with essential landmarks to preserve traveler confidence and avoid fear of missing out (FOMO). Travelers can then book, rearrange, or refine their itinerary through interaction with the AI.

Localhost is not about showing travelers everything — it is about showing them the right moments to meet real people, framed within a familiar city structure.

⸻

Core Product Philosophy (New)

Hosts First, Landmarks Never Lost
	•	Host-led experiences are the primary building blocks of itineraries.
	•	Canonical landmarks (e.g. Empire State Building, Eiffel Tower) are included as contextual anchors, not the core offering.
	•	The AI actively attempts to associate landmarks with relevant hosts.
	•	When no host exists, landmarks are still shown to avoid FOMO, but clearly labeled as self-guided or contextual.

This ensures:
	•	Travelers feel oriented and confident
	•	Hosts feel central, not optional
	•	The platform never degrades into a generic travel guide

⸻

Itinerary Model (New Core Concept)

Anchor vs Context Stops

Each itinerary item is one of two types:

1. Anchor Experience (Host-Led)
	•	Backed by a verified local host
	•	Bookable
	•	Time-bound (e.g. “Afternoon”, “Evening”)
	•	The primary reason a traveler engages with the platform

2. Context Stop (Landmark / Free Exploration)
	•	Non-bookable
	•	Provides narrative flow, orientation, and pacing
	•	Included to preserve traveler expectations and city completeness
	•	Can surround or lead into an Anchor Experience

Example (New York):
	•	Morning: Walk through Midtown (Context)
	•	Afternoon: Hosted photography walk near the Empire State Building (Anchor)
	•	Evening: Dinner with local host in Brooklyn (Anchor)

⸻

AI Itinerary Generation Flow (Revised)

Step 1: City Skeleton
	•	AI identifies essential landmarks, neighborhoods, and city rhythm
	•	These form a non-negotiable baseline for traveler confidence

Step 2: Host Matching (Primary Optimization)
	•	AI searches for hosts that:
	•	Occur near landmarks
	•	Naturally fit time-of-day blocks
	•	Represent cultural depth, not just proximity
	•	Hosts replace or enrich parts of the skeleton where possible

Step 3: Hybrid Assembly
	•	Final itinerary contains:
	•	Host-led Anchor Experiences as the focal points
	•	Context Stops only where hosts are unavailable or unnecessary
	•	No major city landmark is omitted unless the user explicitly requests it

Step 4: Prefill, Not Finalize
	•	The generated itinerary is a starting point, not a commitment
	•	The user can:
	•	Book hosts
	•	Rearrange items
	•	Remove landmarks
	•	Ask the AI to refine based on preferences (“more food”, “less walking”, “budget”, etc.)

⸻

User Experience: Trip Editing Loop (New)
	1.	User receives a host-first itinerary
	2.	User reviews days visually (list + map)
	3.	User can:
	•	Book Anchor Experiences
	•	Drag & reorder items
	•	Replace context stops with hosts (if available)
	•	Ask the AI for modifications
	4.	AI responds incrementally, modifying the existing itinerary instead of regenerating from scratch

The itinerary evolves through conversation, not resets.

⸻

Role of the Map & Timeline (Clarified)
	•	The itinerary list is the source of truth
	•	The map visualizes:
	•	Host locations
	•	Landmarks
	•	Routes between items
	•	Host-led items are visually emphasized over context stops
	•	The user understands at a glance:
	•	Where they’ll meet people
	•	Where they’ll explore independently

⸻

Feature Requirements (Updated Scope Impact)

Phase 1 (MVP – Adjusted, Not Expanded)

Trip Planning (Traveler Tools)
	•	AI-generated host-first itinerary
	•	Explicit labeling of:
	•	Hosted experiences
	•	Self-guided / landmark stops
	•	Ability to:
	•	Rearrange itinerary items
	•	Remove or replace context stops
	•	Request AI refinements
	•	Book hosts directly from the itinerary

Note: No need for “perfect” itineraries in MVP — clarity beats completeness.

⸻

Discovery & Search (Clarified Role)
	•	Search and browse still exist
	•	But itinerary planning becomes the primary discovery surface
	•	Hosts are discovered:
	•	In context
	•	At the right time
	•	For the right reason

This shifts discovery from browsing to storytelling.

⸻

Success Metrics (Refined)

In addition to previous metrics:
	•	% of itineraries containing ≥1 booked host experience
	•	Host exposure per itinerary
	•	Conversion rate from context stop → host booking
	•	User edits per itinerary (signals engagement, not friction)

⸻

Strategic Guardrails (New)
	•	The platform must never generate a trip with zero hosts unless explicitly requested
	•	Landmarks without hosts must never visually overpower host-led experiences
	•	Hosts should feel like protagonists, not ads or upsells
	•	The AI must explain why a host fits into a day, not just place them there

⸻

What This Unlocks (Future-Proofing)

This model enables:
	•	Host reputation compounding through itinerary placement
	•	City-by-city host density growth
	•	AI personalization without losing user trust
	•	Expansion into themed trips (“food-first”, “slow travel”, “culture-heavy”)

⸻

One-Line Product Test (Use This Internally)

“If hosts disappeared tomorrow, would this still feel like Localhost?”

If the answer is yes, the design drifted.