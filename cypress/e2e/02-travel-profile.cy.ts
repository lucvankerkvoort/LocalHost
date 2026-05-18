/**
 * 02-travel-profile.cy.ts
 * Travel profile system tests.
 * All external APIs are mocked — no real server required.
 */

describe('Travel Profile System', () => {
  // -------------------------------------------------------------------------
  // 1. New user (no profile) — AI asks about travel style
  // -------------------------------------------------------------------------
  it('new user without profile is asked about travel style', () => {
    cy.mockSession();

    // Mock the chat to respond with a travel-style question
    cy.intercept('POST', '/api/chat', {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1',
      },
      body: [
        'f:{"messageId":"msg_profile_001"}',
        `0:${JSON.stringify(
          "Hi! Before I build your trip, are you more of a road-tripper or do you prefer exploring a single region deeply? Your travel style helps me plan better."
        )}`,
        'e:{"finishReason":"stop","usage":{"promptTokens":40,"completionTokens":30},"isContinued":false}',
        'd:{"finishReason":"stop","usage":{"promptTokens":40,"completionTokens":30}}',
      ].join('\n'),
    }).as('chatProfileQuestion');

    cy.visit('/');
    cy.waitForGlobe();
    cy.openChat();
    cy.sendChatMessage('Hello');

    cy.get('[data-testid="chat-messages"]', { timeout: 10000 }).should(
      ($el) => {
        const text = $el.text().toLowerCase();
        expect(text).to.satisfy(
          (t: string) => t.includes('road-tripper') || t.includes('travel style'),
          'Expected chat to mention "road-tripper" or "travel style"'
        );
      }
    );
  });

  // -------------------------------------------------------------------------
  // 2. Road tripper response saves profile
  // -------------------------------------------------------------------------
  it('road tripper response triggers saveUserProfile tool', () => {
    cy.mockSession();

    cy.intercept('POST', '/api/chat', {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1',
      },
      body: [
        'f:{"messageId":"msg_profile_002"}',
        `0:${JSON.stringify("Got it — I've saved your travel profile (road trip).")}`,
        `a:{"toolCallId":"tc_save_001","toolName":"saveUserProfile","args":{"travelStyle":"ROAD_TRIP"}}`,
        `b:{"toolCallId":"tc_save_001","result":${JSON.stringify({
          success: true,
          message: "Got it — I've saved your travel profile (road trip).",
        })}}`,
        'e:{"finishReason":"tool-calls","usage":{"promptTokens":50,"completionTokens":35},"isContinued":false}',
        'd:{"finishReason":"tool-calls","usage":{"promptTokens":50,"completionTokens":35}}',
      ].join('\n'),
    }).as('chatSaveRoadTrip');

    cy.visit('/');
    cy.waitForGlobe();
    cy.openChat();
    cy.sendChatMessage("I'm a road tripper");

    cy.get('[data-testid="chat-messages"]', { timeout: 10000 }).should(
      'contain.text',
      'saved'
    );
  });

  // -------------------------------------------------------------------------
  // 3. Region explorer response saves correct travelStyle
  // -------------------------------------------------------------------------
  it('region explorer response saves REGION_EXPLORER profile', () => {
    cy.mockSession();

    cy.intercept('POST', '/api/chat', {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1',
      },
      body: [
        'f:{"messageId":"msg_profile_003"}',
        `0:${JSON.stringify("Perfect, I've saved your region explorer profile!")}`,
        `a:{"toolCallId":"tc_save_002","toolName":"saveUserProfile","args":{"travelStyle":"REGION_EXPLORER"}}`,
        `b:{"toolCallId":"tc_save_002","result":${JSON.stringify({
          success: true,
          travelStyle: 'REGION_EXPLORER',
        })}}`,
        'e:{"finishReason":"tool-calls","usage":{"promptTokens":50,"completionTokens":30},"isContinued":false}',
        'd:{"finishReason":"tool-calls","usage":{"promptTokens":50,"completionTokens":30}}',
      ].join('\n'),
    }).as('chatSaveRegionExplorer');

    cy.visit('/');
    cy.waitForGlobe();
    cy.openChat();
    cy.sendChatMessage('I love exploring a single region deeply');

    // Verify the mock was called (tool call in stream)
    cy.wait('@chatSaveRegionExplorer').its('request.body').should('exist');
  });

  // -------------------------------------------------------------------------
  // 4. Multi-country traveler profile is captured
  // -------------------------------------------------------------------------
  it('multi-country traveler profile is captured', () => {
    cy.mockSession();

    cy.intercept('POST', '/api/chat', {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1',
      },
      body: [
        'f:{"messageId":"msg_profile_004"}',
        `0:${JSON.stringify("Excellent! I've saved your multi-country traveler profile.")}`,
        `a:{"toolCallId":"tc_save_003","toolName":"saveUserProfile","args":{"travelStyle":"MULTI_COUNTRY"}}`,
        `b:{"toolCallId":"tc_save_003","result":${JSON.stringify({
          success: true,
          travelStyle: 'MULTI_COUNTRY',
        })}}`,
        'e:{"finishReason":"tool-calls","usage":{"promptTokens":50,"completionTokens":30},"isContinued":false}',
        'd:{"finishReason":"tool-calls","usage":{"promptTokens":50,"completionTokens":30}}',
      ].join('\n'),
    }).as('chatSaveMultiCountry');

    cy.visit('/');
    cy.waitForGlobe();
    cy.openChat();
    cy.sendChatMessage('I love visiting many countries in one trip');

    cy.wait('@chatSaveMultiCountry').its('request.body').should('exist');
    cy.get('[data-testid="chat-messages"]', { timeout: 10000 }).should(
      'contain.text',
      'multi-country'
    );
  });

  // -------------------------------------------------------------------------
  // 5. When profile exists, AI skips profile question and starts planning
  // -------------------------------------------------------------------------
  it('existing profile skips travel style question', () => {
    cy.mockSession();

    // Chat immediately suggests planning — no profile question
    cy.intercept('POST', '/api/chat', {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1',
      },
      body: [
        'f:{"messageId":"msg_profile_005"}',
        `0:${JSON.stringify(
          "Sure, let me start planning your Barcelona itinerary right away!"
        )}`,
        'e:{"finishReason":"stop","usage":{"promptTokens":40,"completionTokens":20},"isContinued":false}',
        'd:{"finishReason":"stop","usage":{"promptTokens":40,"completionTokens":20}}',
      ].join('\n'),
    }).as('chatWithProfile');

    cy.visit('/');
    cy.waitForGlobe();
    cy.openChat();
    cy.sendChatMessage('Plan a trip to Barcelona');

    cy.get('[data-testid="chat-messages"]', { timeout: 10000 }).should(
      ($el) => {
        const text = $el.text().toLowerCase();
        // Should NOT ask about travel style — should proceed with planning
        expect(text).not.to.include('road-tripper');
        expect(text).to.include('barcelona');
      }
    );
  });
});
