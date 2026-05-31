/**
 * 03-trip-planning.cy.ts
 * Trip planning flow tests — chat, AI response, orchestrator, itinerary panel.
 * All external APIs are mocked — no real server required.
 */

describe('Trip Planning', () => {
  // -------------------------------------------------------------------------
  // 1. Chat widget is visible and can be opened
  // -------------------------------------------------------------------------
  it('chat widget is visible and can be opened', () => {
    cy.visit('/');
    cy.waitForGlobe();
    cy.get('[data-testid="chat-toggle"]').should('be.visible').click();
    cy.get('[data-testid="chat-input"]', { timeout: 5000 }).should('be.visible');
  });

  // -------------------------------------------------------------------------
  // 2. User can type a destination in the chat input
  // -------------------------------------------------------------------------
  it('user can type a destination in the chat input', () => {
    cy.visit('/');
    cy.waitForGlobe();
    cy.openChat();
    cy.get('[data-testid="chat-input"]').type('Barcelona');
    cy.get('[data-testid="chat-input"]').should('have.value', 'Barcelona');
  });

  // -------------------------------------------------------------------------
  // 3. Sending a message shows it in the chat messages area
  // -------------------------------------------------------------------------
  it('sending a message shows it in chat messages', () => {
    cy.mockSession();
    cy.mockAIChat();
    cy.visit('/');
    cy.waitForGlobe();
    cy.openChat();
    cy.sendChatMessage('Plan a trip to Barcelona');

    cy.get('[data-testid="chat-messages"]', { timeout: 5000 }).should(
      'contain.text',
      'Barcelona'
    );
  });

  // -------------------------------------------------------------------------
  // 4. AI response appears after sending a message
  // -------------------------------------------------------------------------
  it('AI response appears after sending a message', () => {
    cy.mockSession();
    cy.mockAIChat();
    cy.visit('/');
    cy.waitForGlobe();
    cy.openChat();
    cy.sendChatMessage('Plan a trip to Barcelona');

    // The mocked response includes "plan"
    cy.get('[data-testid="chat-messages"]', { timeout: 10000 }).should(
      'contain.text',
      'plan'
    );
  });

  // -------------------------------------------------------------------------
  // 5. Orchestrator job is triggered after AI tool call
  // -------------------------------------------------------------------------
  it('orchestrator job is triggered after AI generateItinerary tool call', () => {
    cy.mockSession();
    cy.mockAIChat();
    cy.mockOrchestrator();
    cy.visit('/');
    cy.waitForGlobe();
    cy.openChat();
    cy.sendChatMessage('Plan a 3-day trip to Barcelona');

    // Orchestrator GET should be called as the UI polls for status
    cy.wait('@orchestratorGet', { timeout: 15000 });
  });

  // -------------------------------------------------------------------------
  // 6. Itinerary panel appears after orchestrator job completes
  // -------------------------------------------------------------------------
  it('itinerary panel appears after orchestrator job completes', () => {
    cy.mockSession();
    cy.mockAIChat();
    cy.mockOrchestrator();
    cy.visit('/');
    cy.waitForGlobe();
    cy.openChat();
    cy.sendChatMessage('Plan a trip to Barcelona');

    cy.get('[data-testid="itinerary-panel"]', { timeout: 15000 }).should(
      'be.visible'
    );
  });

  // -------------------------------------------------------------------------
  // 7. Globe does not crash after itinerary data is loaded
  // -------------------------------------------------------------------------
  it('globe container is still visible after itinerary loads', () => {
    cy.mockSession();
    cy.mockAIChat();
    cy.mockOrchestrator();
    cy.visit('/');
    cy.waitForGlobe();
    cy.openChat();
    cy.sendChatMessage('Plan a trip to Barcelona');

    // Wait for itinerary panel first
    cy.get('[data-testid="itinerary-panel"]', { timeout: 15000 }).should(
      'be.visible'
    );

    // Globe should still be rendered (no crash)
    cy.get('[data-testid="globe-container"]').should('be.visible');
  });
});
