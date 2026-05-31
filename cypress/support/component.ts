/**
 * Cypress Component Testing support file.
 * Loaded before every component spec.
 */
// cypress/react is the package shipped with Cypress; react18 is an alias.
// Use the available package to avoid missing-module errors.
import { mount } from 'cypress/react';

// Make cy.mount() available in component tests.
Cypress.Commands.add('mount', mount);

// Extend Cypress types for component testing.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      mount: typeof mount;
    }
  }
}

export {};
