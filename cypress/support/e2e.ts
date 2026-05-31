/**
 * Cypress E2E support file.
 * Loaded before every E2E spec.
 */
import './commands';

// ---------------------------------------------------------------------------
// Global before hooks
// ---------------------------------------------------------------------------

before(() => {
  // Nothing to do globally — individual tests mock what they need.
});

// Silence uncaught exceptions that come from third-party libraries (Cesium,
// etc.) that are not actionable in E2E context.
Cypress.on('uncaught:exception', (err) => {
  // Cesium and some React internals throw non-fatal errors during teardown.
  // Returning false prevents Cypress from failing the test.
  const ignoredMessages = [
    'ResizeObserver loop',
    'CesiumWidget',
    'Cannot read properties of undefined',
    'WebGL',
    'context lost',
  ];

  if (ignoredMessages.some((msg) => err.message.includes(msg))) {
    return false;
  }

  // Let all other errors propagate and fail the test.
  return true;
});
