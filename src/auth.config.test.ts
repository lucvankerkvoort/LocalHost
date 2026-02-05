import assert from "node:assert/strict";
import test from "node:test";

import { shouldTrustAuthHost } from "./auth.config";

test("should trust host when AUTH_TRUST_HOST is true", () => {
  assert.equal(shouldTrustAuthHost({ AUTH_TRUST_HOST: "true" }), true);
});

test("should trust host when AUTH_URL is configured", () => {
  assert.equal(shouldTrustAuthHost({ AUTH_URL: "https://example.com" }), true);
});

test("should trust host when NEXTAUTH_URL is configured", () => {
  assert.equal(shouldTrustAuthHost({ NEXTAUTH_URL: "https://example.com" }), true);
});

test("should trust host on Netlify deployments", () => {
  assert.equal(shouldTrustAuthHost({ NETLIFY: "true" }), true);
});

test("should trust host in development and test environments", () => {
  assert.equal(shouldTrustAuthHost({ NODE_ENV: "development" }), true);
  assert.equal(shouldTrustAuthHost({ NODE_ENV: "test" }), true);
});

test("should not trust host in production without explicit host config", () => {
  assert.equal(shouldTrustAuthHost({ NODE_ENV: "production" }), false);
});
