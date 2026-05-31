/**
 * 01-auth.cy.ts
 * Authentication flow tests.
 * All external APIs are mocked — no real server required.
 */

describe('Authentication', () => {
  // -------------------------------------------------------------------------
  // 1. Home page loads without auth
  // -------------------------------------------------------------------------
  it('home page loads without authentication', () => {
    cy.clearSession();
    cy.visit('/');
    cy.waitForGlobe();
    cy.get('[data-testid="navbar"]').should('be.visible');
  });

  // -------------------------------------------------------------------------
  // 2. Unauthenticated user is redirected from /trips
  // -------------------------------------------------------------------------
  it('unauthenticated user is redirected from /trips', () => {
    cy.clearSession();
    cy.visit('/trips', { failOnStatusCode: false });
    // Should either redirect to home or to the sign-in page
    cy.url().should('match', /^\/(auth\/signin|$|\?)/);
  });

  // -------------------------------------------------------------------------
  // 3. Unauthenticated user is redirected from /profile
  // -------------------------------------------------------------------------
  it('unauthenticated user is redirected from /profile', () => {
    cy.clearSession();
    cy.visit('/profile', { failOnStatusCode: false });
    cy.url().should('match', /^\/(auth\/signin|$|\?)/);
  });

  // -------------------------------------------------------------------------
  // 4. Logged-in user can see the user menu
  // -------------------------------------------------------------------------
  it('logged-in user can see user menu', () => {
    cy.mockSession();
    cy.visit('/');
    cy.waitForGlobe();
    cy.get('[data-testid="user-menu"]').should('be.visible');
  });

  // -------------------------------------------------------------------------
  // 5. Logged-in user can access /trips without being redirected
  // -------------------------------------------------------------------------
  it('logged-in user can access /trips', () => {
    cy.mockSession();
    cy.mockTripsAPI([]);
    cy.visit('/trips');
    // Should NOT be redirected away — URL stays on /trips
    cy.url().should('include', '/trips');
  });

  // -------------------------------------------------------------------------
  // 6. Session API returns the correct user shape
  // -------------------------------------------------------------------------
  it('session API returns correct user shape', () => {
    cy.mockSession();
    cy.visit('/');
    cy.waitForGlobe();

    cy.window().then((win) => {
      return win
        .fetch('/api/auth/session')
        .then((res) => res.json())
        .then((data: { user?: { id?: string } }) => {
          expect(data).to.have.property('user');
          expect(data.user).to.have.property('id', 'e2e-traveler-full-access');
        });
    });
  });
});
