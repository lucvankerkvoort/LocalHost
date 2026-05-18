/**
 * Cypress Custom Commands
 * Provides high-level helpers for mocking APIs and interacting with the app.
 */

// This empty export makes the file a module, which is required for
// `declare global` augmentations to work correctly in TypeScript.
export {};

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface MockSessionUser {
  id?: string;
  email?: string;
  name?: string;
  image?: string | null;
}

interface MockAIChatOptions {
  responseText?: string;
  toolResult?: Record<string, unknown>;
}

interface TestTravelProfile {
  id?: string;
  userId?: string;
  travelStyle: 'ROAD_TRIP' | 'REGION_EXPLORER' | 'MULTI_COUNTRY' | 'BACKPACKER' | 'LUXURY' | 'CULTURAL' | 'ADVENTURE' | 'FLEXIBLE';
  pace?: 'RELAXED' | 'BALANCED' | 'PACKED';
  budget?: 'BUDGET' | 'MID' | 'PREMIUM';
  groupType?: 'SOLO' | 'COUPLE' | 'FAMILY' | 'GROUP';
  transportPreference?: string | null;
  interests?: string[];
  completedAt?: string | null;
}

interface OrchestratorPlan {
  destinations?: Array<{ name: string; lat: number; lng: number }>;
  stops?: Array<{
    title: string;
    type: string;
    days: Array<{
      dayIndex: number;
      title: string;
      items: Array<{ title: string; type: string; locationName?: string }>;
    }>;
  }>;
}

// Extend Cypress chainable with our custom commands
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Mock the NextAuth session endpoint to return a logged-in user.
       * @param user - Optional partial user override. Defaults to the e2e traveler.
       */
      mockSession(user?: MockSessionUser): Chainable<void>;

      /**
       * Clear the session — intercepts /api/auth/session to return an empty object.
       */
      clearSession(): Chainable<void>;

      /**
       * Mock the AI chat endpoint with a realistic Vercel AI SDK data-stream response.
       */
      mockAIChat(options?: MockAIChatOptions): Chainable<void>;

      /**
       * Mock the orchestrator endpoints (POST create + GET poll).
       * @param plan - Optional plan override for the completed job.
       */
      mockOrchestrator(plan?: OrchestratorPlan): Chainable<void>;

      /**
       * Mock GET /api/trips with a trip list.
       */
      mockTripsAPI(trips?: unknown[]): Chainable<void>;

      /**
       * Wait for the 3-D globe canvas to be visible.
       */
      waitForGlobe(): Chainable<void>;

      /**
       * Open the chat widget.
       */
      openChat(): Chainable<void>;

      /**
       * Type a message into the chat input and click send.
       */
      sendChatMessage(text: string): Chainable<void>;

      /**
       * Intercept /api/chat and inject an x-e2e-travel-profile header so the
       * server runs its real personalization logic with the given profile.
       * Requires the server to be started with E2E_PROFILE_INJECTION=true.
       * The chat response is still mocked (same as mockAIChat) so no real LLM is hit.
       */
      mockAIChatWithProfile(profile: TestTravelProfile, options?: MockAIChatOptions): Chainable<void>;
    }
  }
}

// =============================================================================
// DEFAULT FIXTURES
// =============================================================================

const DEFAULT_SESSION = {
  user: {
    id: 'e2e-traveler-full-access',
    email: 'traveler@e2e.localhost',
    name: 'Test Traveler',
    image: null as string | null,
  },
  expires: '2027-12-31T00:00:00.000Z',
};

const DEFAULT_BARCELONA_PLAN: OrchestratorPlan = {
  destinations: [{ name: 'Barcelona', lat: 41.3851, lng: 2.1734 }],
  stops: [
    {
      title: 'Barcelona',
      type: 'CITY',
      days: [
        {
          dayIndex: 1,
          title: 'Day 1 - Gothic Quarter',
          items: [
            {
              title: 'Gothic Quarter',
              type: 'SIGHT',
              locationName: 'Gothic Quarter, Barcelona',
            },
          ],
        },
        {
          dayIndex: 2,
          title: 'Day 2 - Sagrada Familia',
          items: [
            {
              title: 'Sagrada Familia',
              type: 'SIGHT',
              locationName: 'Sagrada Familia, Barcelona',
            },
          ],
        },
        {
          dayIndex: 3,
          title: 'Day 3 - Park Güell',
          items: [
            {
              title: 'Park Güell',
              type: 'SIGHT',
              locationName: 'Park Güell, Barcelona',
            },
          ],
        },
      ],
    },
  ],
};

// =============================================================================
// COMMAND IMPLEMENTATIONS
// =============================================================================

Cypress.Commands.add('mockSession', (user?: MockSessionUser) => {
  const session = {
    user: {
      ...DEFAULT_SESSION.user,
      ...user,
    },
    expires: DEFAULT_SESSION.expires,
  };

  cy.intercept('GET', '/api/auth/session', {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: session,
  }).as('mockSession');
});

Cypress.Commands.add('clearSession', () => {
  cy.intercept('GET', '/api/auth/session', {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {},
  }).as('clearSession');
});

Cypress.Commands.add('mockAIChat', (options?: MockAIChatOptions) => {
  const responseText =
    options?.responseText ??
    "I'll plan a trip for you! Let me generate your itinerary.";

  const toolResult = options?.toolResult ?? {
    success: true,
    jobId: 'mock-job-123',
    queued: false,
    mode: 'draft',
  };

  // Build a minimal Vercel AI SDK data-stream body
  const streamLines = [
    'f:{"messageId":"msg_mock_001"}',
    `0:${JSON.stringify(responseText)}`,
    `a:{"toolCallId":"tc_mock_001","toolName":"generateItinerary","args":{}}`,
    `b:{"toolCallId":"tc_mock_001","result":${JSON.stringify(toolResult)}}`,
    'e:{"finishReason":"stop","usage":{"promptTokens":60,"completionTokens":40},"isContinued":false}',
    'd:{"finishReason":"stop","usage":{"promptTokens":60,"completionTokens":40}}',
  ].join('\n');

  cy.intercept('POST', '/api/chat', {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'x-vercel-ai-data-stream': 'v1',
    },
    body: streamLines,
  }).as('mockAIChat');
});

Cypress.Commands.add('mockOrchestrator', (plan?: OrchestratorPlan) => {
  const resolvedPlan = plan ?? DEFAULT_BARCELONA_PLAN;

  // POST — job created
  cy.intercept('POST', '/api/orchestrator', {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      jobId: 'mock-job-123',
      status: 'running',
      stage: 'geocoding',
      message: 'Planning your trip...',
      progressCurrent: 1,
      progressTotal: 4,
    },
  }).as('orchestratorPost');

  // GET — job complete
  cy.intercept('GET', '/api/orchestrator*', {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      jobId: 'mock-job-123',
      status: 'complete',
      stage: 'complete',
      message: 'Your itinerary is ready!',
      progressCurrent: 4,
      progressTotal: 4,
      plan: resolvedPlan,
    },
  }).as('orchestratorGet');
});

Cypress.Commands.add('mockAIChatWithProfile', (testProfile: TestTravelProfile, options?: MockAIChatOptions) => {
  const responseText =
    options?.responseText ??
    "I'll plan a trip for you! Let me generate your itinerary.";

  const toolResult = options?.toolResult ?? {
    success: true,
    jobId: 'mock-job-profile',
    queued: false,
    mode: 'draft',
  };

  const resolvedProfile: TestTravelProfile = {
    id: 'e2e-injected-profile',
    userId: 'e2e-test-user',
    pace: 'BALANCED',
    budget: 'MID',
    groupType: 'SOLO',
    transportPreference: null,
    interests: [],
    completedAt: new Date().toISOString(),
    ...testProfile,
  };

  const streamLines = [
    'f:{"messageId":"msg_profile_001"}',
    `0:${JSON.stringify(responseText)}`,
    `a:{"toolCallId":"tc_profile_001","toolName":"generateItinerary","args":{}}`,
    `b:{"toolCallId":"tc_profile_001","result":${JSON.stringify(toolResult)}}`,
    'e:{"finishReason":"stop","usage":{"promptTokens":60,"completionTokens":40},"isContinued":false}',
    'd:{"finishReason":"stop","usage":{"promptTokens":60,"completionTokens":40}}',
  ].join('\n');

  cy.intercept('POST', '/api/chat', (req) => {
    // Inject the travel profile so the server's personalization logic runs with it.
    // Only takes effect when the server is started with E2E_PROFILE_INJECTION=true.
    req.headers['x-e2e-travel-profile'] = JSON.stringify(resolvedProfile);
    req.reply({
      statusCode: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1',
      },
      body: streamLines,
    });
  }).as('mockAIChatWithProfile');
});

Cypress.Commands.add('mockTripsAPI', (trips?: unknown[]) => {
  cy.intercept('GET', '/api/trips', {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: trips ?? [],
  }).as('mockTripsAPI');
});

Cypress.Commands.add('waitForGlobe', () => {
  cy.get('[data-testid="globe-container"] canvas', { timeout: 20000 }).should(
    'be.visible'
  );
});

Cypress.Commands.add('openChat', () => {
  cy.get('[data-testid="chat-toggle"]').should('be.visible').click();
  cy.get('[data-testid="chat-input"]', { timeout: 5000 }).should('be.visible');
});

Cypress.Commands.add('sendChatMessage', (text: string) => {
  cy.get('[data-testid="chat-input"]').should('be.visible').type(text);
  cy.get('[data-testid="chat-send"]').should('be.visible').click();
});
