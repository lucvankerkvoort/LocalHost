import type { AgentStrategy } from './types';

export const multiCountryStrategy: AgentStrategy = {
  id: 'multi-country',
  systemPromptSection: `Travel Mode: Multi-Country Traveler
- The user wants to visit multiple cities or countries on a single trip.
- Budget 2-4 nights per city so each place gets real time — not just airport → hotel → airport.
- Connect cities with TRANSPORT items (flight, train, overnight bus) as the last item of each stop's day.
- Account for transit days: arrival day and departure day are half-days for activities — plan accordingly.
- One stop per city. Stop type: CITY for each destination.
- Surface visa and entry logistics where relevant: Schengen area day limits, e-visa countries, visa-on-arrival availability.
- When asking clarifying questions, focus on: which cities or countries they have in mind, total trip length, and whether budget allows flights vs. trains.`,
};
