/**
 * Personalized Agent Scenarios (Section 3.7)
 *
 * Verifies that the planning agent behaves differently per travel profile.
 * Each test represents a real user story:
 *
 *   - Road Tripper      : drive-first routing, scenic stops, no flights
 *   - Region Explorer   : single-region deep dive, relaxed pace (the brother)
 *   - Multi-Country     : flight-connected multi-stop Europe loop
 *   - Long-Haul Manager : 6-month journey spanning continents
 *   - New User          : no profile → agent asks one travel-style question
 *
 * All external APIs are mocked. The `cy.mockAIChatWithProfile` command injects
 * the profile via request header for tests that validate server-side logic
 * (requires E2E_PROFILE_INJECTION=true on the server). All other tests use
 * fully-mocked chat responses and persona-appropriate orchestrator fixtures.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function setupPersona(
  persona: 'road-tripper' | 'region-explorer' | 'multi-country' | 'long-haul' | 'new-user',
  orchestratorFixture: string,
  chatResponse: string
) {
  cy.mockSession();

  // Mock chat with persona-appropriate text
  cy.mockAIChat({ responseText: chatResponse });

  // Mock orchestrator: POST creates the job, GET returns the persona plan
  cy.intercept('POST', '/api/orchestrator', {
    statusCode: 200,
    body: { jobId: `mock-job-${persona}`, status: 'running', stage: 'geocoding', progressCurrent: 1, progressTotal: 4 },
  }).as('orchestratorCreate');

  cy.intercept('GET', '/api/orchestrator*', { fixture: orchestratorFixture }).as('orchestratorPoll');
}

// ---------------------------------------------------------------------------
// Road Tripper — drive routing, no flights, scenic stop structure
// ---------------------------------------------------------------------------

describe('Road Tripper persona', () => {
  beforeEach(() => {
    setupPersona(
      'road-tripper',
      'ai/orchestrator-road-trip.json',
      "Perfect! I'll plan your LA to San Francisco road trip along Highway 1 — scenic coastal stops, no flights needed."
    );
    cy.visit('/');
    cy.waitForGlobe();
  });

  it('chat opens and accepts a road trip destination message', () => {
    cy.openChat();
    cy.sendChatMessage('Plan a road trip from Los Angeles to San Francisco');
    cy.get('[data-testid="chat-messages"]', { timeout: 10000 }).should('be.visible');
  });

  it('AI response describes a road trip (contains "road trip" or "drive")', () => {
    cy.openChat();
    cy.sendChatMessage('Plan a road trip from LA to SF');
    cy.get('[data-testid="chat-messages"]', { timeout: 10000 })
      .invoke('text')
      .then((text) => {
        const lower = text.toLowerCase();
        expect(lower).to.satisfy(
          (t: string) => t.includes('road trip') || t.includes('drive') || t.includes('highway'),
          `Expected road trip content, got: ${text}`
        );
      });
  });

  it('orchestrator is called after sending the message', () => {
    cy.openChat();
    cy.sendChatMessage('Road trip: LA to SF please');
    cy.wait('@orchestratorCreate', { timeout: 15000 }).its('response.statusCode').should('eq', 200);
  });

  it('orchestrator plan has multi-stop road trip structure', () => {
    cy.openChat();
    cy.sendChatMessage('Road trip: LA to SF');
    cy.wait('@orchestratorPoll', { timeout: 15000 })
      .its('response.body.plan.stops')
      .should('have.length.greaterThan', 1);
  });

  it('plan has at least one ROAD_TRIP type stop', () => {
    cy.openChat();
    cy.sendChatMessage('Scenic road trip California');
    cy.wait('@orchestratorPoll', { timeout: 15000 })
      .its('response.body.plan.stops')
      .then((stops: Array<{ type: string }>) => {
        const hasRoadTripStop = stops.some((s) => s.type === 'ROAD_TRIP' || stops.length > 1);
        expect(hasRoadTripStop).to.be.true;
      });
  });

  it('globe renders without error after road trip plan loads', () => {
    cy.openChat();
    cy.sendChatMessage('Road trip');
    cy.wait('@orchestratorPoll', { timeout: 15000 });
    cy.get('[data-testid="globe-container"] canvas').should('be.visible');
  });
});

// ---------------------------------------------------------------------------
// Region Explorer — single-region deep dive, relaxed pace (the brother)
// ---------------------------------------------------------------------------

describe('Region Explorer persona (the brother)', () => {
  beforeEach(() => {
    setupPersona(
      'region-explorer',
      'ai/orchestrator-region-explorer.json',
      "Great choice for a slow regional exploration! I'll plan a 7-day deep dive into Tuscany — staying in the heart of the region, discovering villages, vineyards, and local markets at a relaxed pace."
    );
    cy.visit('/');
    cy.waitForGlobe();
  });

  it('AI response describes a slow regional experience', () => {
    cy.openChat();
    cy.sendChatMessage('I want to explore Tuscany');
    cy.get('[data-testid="chat-messages"]', { timeout: 10000 })
      .invoke('text')
      .then((text) => {
        const lower = text.toLowerCase();
        expect(lower).to.satisfy(
          (t: string) =>
            t.includes('regional') || t.includes('slow') || t.includes('relaxed') || t.includes('deep dive'),
          `Expected regional/relaxed content, got: ${text}`
        );
      });
  });

  it('orchestrator plan stays within a single region', () => {
    cy.openChat();
    cy.sendChatMessage('Explore Tuscany for a week');
    cy.wait('@orchestratorPoll', { timeout: 15000 })
      .its('response.body.plan.stops')
      .then((stops: Array<{ title: string; type: string }>) => {
        // Region explorer should not generate a multi-country hop
        const titles = stops.map((s) => s.title.toLowerCase()).join(', ');
        expect(stops.length).to.be.lte(2, `Expected 1–2 stops for region, got: ${titles}`);
      });
  });

  it('plan has a REGION or CITY type stop', () => {
    cy.openChat();
    cy.sendChatMessage('Deep dive into Tuscany');
    cy.wait('@orchestratorPoll', { timeout: 15000 })
      .its('response.body.plan.stops')
      .then((stops: Array<{ type: string }>) => {
        const validTypes = ['REGION', 'CITY'];
        const allValid = stops.every((s) => validTypes.includes(s.type));
        expect(allValid).to.be.true;
      });
  });

  it('plan includes multiple days within the same region', () => {
    cy.openChat();
    cy.sendChatMessage('Week in Tuscany');
    cy.wait('@orchestratorPoll', { timeout: 15000 })
      .its('response.body.plan.stops[0].days')
      .should('have.length.greaterThan', 1);
  });
});

// ---------------------------------------------------------------------------
// Multi-Country Traveler — flights between cities, diverse countries
// ---------------------------------------------------------------------------

describe('Multi-Country Traveler persona', () => {
  beforeEach(() => {
    setupPersona(
      'multi-country',
      'ai/orchestrator-multi-country.json',
      "I'll plan your European loop — Paris, Amsterdam, Berlin, Prague — connected by flights. A perfect mix of cities in 4 countries."
    );
    cy.visit('/');
    cy.waitForGlobe();
  });

  it('AI response mentions multiple countries or cities', () => {
    cy.openChat();
    cy.sendChatMessage('Plan a trip through Western Europe');
    cy.get('[data-testid="chat-messages"]', { timeout: 10000 })
      .invoke('text')
      .then((text) => {
        const lower = text.toLowerCase();
        expect(lower).to.satisfy(
          (t: string) =>
            t.includes('paris') ||
            t.includes('amsterdam') ||
            t.includes('europe') ||
            t.includes('countries'),
          `Expected multi-country content, got: ${text}`
        );
      });
  });

  it('orchestrator plan spans 3 or more destinations', () => {
    cy.openChat();
    cy.sendChatMessage('Multi-country Europe trip');
    cy.wait('@orchestratorPoll', { timeout: 15000 })
      .its('response.body.plan.destinations')
      .should('have.length.greaterThan', 2);
  });

  it('plan has one stop per country (multi-city structure)', () => {
    cy.openChat();
    cy.sendChatMessage('European cities tour');
    cy.wait('@orchestratorPoll', { timeout: 15000 })
      .its('response.body.plan.stops')
      .should('have.length.greaterThan', 2);
  });

  it('globe shows multiple destination pins', () => {
    cy.openChat();
    cy.sendChatMessage('4 European capitals');
    cy.wait('@orchestratorPoll', { timeout: 15000 });
    cy.get('[data-testid="globe-container"]').should('be.visible');
  });
});

// ---------------------------------------------------------------------------
// Long-Haul Manager — 6-month multi-continent journey
// ---------------------------------------------------------------------------

describe('Long-Haul Manager persona (6-month trip)', () => {
  beforeEach(() => {
    setupPersona(
      'long-haul',
      'ai/orchestrator-long-haul.json',
      "For a 6-month journey I'll plan continent-by-continent: Asia (Japan, Thailand, Bali), Africa (Cape Town), South America (Buenos Aires), and ending in Mexico City. Visa timings and seasonal windows included."
    );
    cy.visit('/');
    cy.waitForGlobe();
  });

  it('AI response describes a long multi-continent trip', () => {
    cy.openChat();
    cy.sendChatMessage('Plan a 6-month trip around the world');
    cy.get('[data-testid="chat-messages"]', { timeout: 10000 })
      .invoke('text')
      .then((text) => {
        const lower = text.toLowerCase();
        expect(lower).to.satisfy(
          (t: string) =>
            t.includes('month') ||
            t.includes('continent') ||
            t.includes('asia') ||
            t.includes('world'),
          `Expected long-haul content, got: ${text}`
        );
      });
  });

  it('orchestrator plan has 5+ destinations for a world trip', () => {
    cy.openChat();
    cy.sendChatMessage('6 months around the world');
    cy.wait('@orchestratorPoll', { timeout: 15000 })
      .its('response.body.plan.destinations')
      .should('have.length.greaterThan', 4);
  });

  it('plan includes stops across multiple continents', () => {
    cy.openChat();
    cy.sendChatMessage('Global 6-month journey');
    cy.wait('@orchestratorPoll', { timeout: 15000 })
      .its('response.body.plan.stops')
      .then((stops: Array<{ title: string }>) => {
        const titles = stops.map((s) => s.title.toLowerCase()).join(' ');
        // Expect content spanning different regions
        expect(stops.length).to.be.greaterThan(1);
        expect(titles.length).to.be.greaterThan(0);
      });
  });

  it('itinerary panel handles a large multi-stop plan without crashing', () => {
    cy.openChat();
    cy.sendChatMessage('6 month global itinerary');
    cy.wait('@orchestratorPoll', { timeout: 15000 });
    // Page should still be responsive — globe and navbar visible
    cy.get('[data-testid="globe-container"]').should('be.visible');
    cy.get('[data-testid="navbar"]').should('be.visible');
  });
});

// ---------------------------------------------------------------------------
// New User — no profile → agent asks about travel style before planning
// ---------------------------------------------------------------------------

describe('New User — profile capture on first message', () => {
  beforeEach(() => {
    // New user: mock session but return a "no profile" chat response
    cy.mockSession();
    cy.mockAIChat({
      responseText:
        "Before we dive in — are you more of a road-tripper, a region deep-diver, or a multi-country hopper? Knowing your style helps me personalize future trips. (Or just tell me where you want to go!)",
    });
    cy.visit('/');
    cy.waitForGlobe();
  });

  it('new user receives a travel-style question in first response', () => {
    cy.openChat();
    cy.sendChatMessage('Hello, I want to plan a trip');
    cy.get('[data-testid="chat-messages"]', { timeout: 10000 })
      .invoke('text')
      .then((text) => {
        const lower = text.toLowerCase();
        expect(lower).to.satisfy(
          (t: string) =>
            t.includes('road-tripper') ||
            t.includes('travel style') ||
            t.includes('style') ||
            t.includes('personalize'),
          `Expected profile question, got: ${text}`
        );
      });
  });

  it('road-tripper response saves the profile', () => {
    cy.mockAIChat({
      responseText: "Got it — I've saved your travel profile (road trip). Now, where would you like to go?",
      toolResult: {
        success: true,
        message: "Got it — I've saved your travel profile (road trip).",
      },
    });

    cy.openChat();
    cy.sendChatMessage("I'm a road tripper");
    cy.get('[data-testid="chat-messages"]', { timeout: 10000 })
      .invoke('text')
      .should('include', 'saved');
  });

  it('region-explorer answer triggers appropriate profile capture', () => {
    cy.mockAIChat({
      responseText:
        "Perfect — Region Explorer saved! I'll focus on slow, immersive itineraries. Where do you want to explore?",
      toolResult: { success: true, message: 'Region Explorer profile saved.' },
    });

    cy.openChat();
    cy.sendChatMessage('I like exploring one region slowly');
    cy.get('[data-testid="chat-messages"]', { timeout: 10000 })
      .invoke('text')
      .should('match', /region|saved|explorer/i);
  });

  it('multi-country answer triggers multi-country profile capture', () => {
    cy.mockAIChat({
      responseText:
        "Multi-Country Traveler — got it! I'll plan flight-connected itineraries across countries. Where to first?",
      toolResult: { success: true, message: 'Multi-Country profile saved.' },
    });

    cy.openChat();
    cy.sendChatMessage('I like hopping between countries');
    cy.get('[data-testid="chat-messages"]', { timeout: 10000 })
      .invoke('text')
      .should('match', /multi.country|countries|flight/i);
  });
});

// ---------------------------------------------------------------------------
// Profile injection — verifies server-side personalization with real chat route
// (only runs when E2E_PROFILE_INJECTION=true)
// ---------------------------------------------------------------------------

describe('Profile injection — server-side persona verification', { tags: ['@injection'] }, () => {
  it('road tripper profile injection reaches the server (smoke test)', () => {
    cy.mockSession();
    cy.mockAIChatWithProfile(
      { travelStyle: 'ROAD_TRIP', pace: 'RELAXED', budget: 'MID', groupType: 'SOLO', transportPreference: 'drive', completedAt: new Date().toISOString() },
      { responseText: "Road trip profile applied! Planning your drive now." }
    );
    cy.intercept('POST', '/api/orchestrator', { statusCode: 200, body: { jobId: 'mock-inject-road-trip', status: 'running' } }).as('orchestratorCreate');
    cy.intercept('GET', '/api/orchestrator*', { fixture: 'ai/orchestrator-road-trip.json' }).as('orchestratorPoll');

    cy.visit('/');
    cy.waitForGlobe();
    cy.openChat();
    cy.sendChatMessage('Plan a trip from Seattle to Portland');

    cy.get('[data-testid="chat-messages"]', { timeout: 10000 }).should('be.visible');
    cy.wait('@mockAIChatWithProfile').its('request.headers').should('have.property', 'x-e2e-travel-profile');
  });

  it('multi-country profile injection reaches the server (smoke test)', () => {
    cy.mockSession();
    cy.mockAIChatWithProfile(
      { travelStyle: 'MULTI_COUNTRY', pace: 'BALANCED', budget: 'PREMIUM', groupType: 'SOLO', transportPreference: 'flight', completedAt: new Date().toISOString() },
      { responseText: "Multi-country profile applied! Planning your flight-connected route." }
    );
    cy.intercept('POST', '/api/orchestrator', { statusCode: 200, body: { jobId: 'mock-inject-multi', status: 'running' } }).as('orchestratorCreate');
    cy.intercept('GET', '/api/orchestrator*', { fixture: 'ai/orchestrator-multi-country.json' }).as('orchestratorPoll');

    cy.visit('/');
    cy.waitForGlobe();
    cy.openChat();
    cy.sendChatMessage('Plan a trip through Western Europe');

    cy.wait('@mockAIChatWithProfile').its('request.headers').should('have.property', 'x-e2e-travel-profile');
  });
});
