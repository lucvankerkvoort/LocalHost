import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
  buildImageRequestSignaturePayload,
  verifySignedImageRequest,
} from './request-auth';

const SECRET = 'test-image-signing-secret';

function signUrl(url: URL, expiryEpochSeconds: number, nonce: string): void {
  url.searchParams.set('authExp', String(expiryEpochSeconds));
  url.searchParams.set('authNonce', nonce);
  const payload = buildImageRequestSignaturePayload(url, expiryEpochSeconds, nonce);
  const signature = createHmac('sha256', SECRET).update(payload).digest('hex');
  url.searchParams.set('authSig', signature);
}

test('verifySignedImageRequest accepts valid signature', () => {
  const url = new URL('https://example.com/api/images/places?query=Eiffel%20Tower&city=Paris&sig=1');
  const expiresAt = Math.floor(Date.now() / 1000) + 60;
  signUrl(url, expiresAt, 'nonce-1');

  const result = verifySignedImageRequest(url, SECRET);
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'signed');
});

test('verifySignedImageRequest rejects tampered query', () => {
  const url = new URL('https://example.com/api/images/places?query=Eiffel%20Tower&city=Paris&sig=1');
  const expiresAt = Math.floor(Date.now() / 1000) + 60;
  signUrl(url, expiresAt, 'nonce-2');

  url.searchParams.set('city', 'Rome');
  const result = verifySignedImageRequest(url, SECRET);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_signature');
});

test('verifySignedImageRequest rejects expired signature', () => {
  const url = new URL('https://example.com/api/images/places/list?query=Louvre');
  const expiredAt = Math.floor(Date.now() / 1000) - 5;
  signUrl(url, expiredAt, 'nonce-3');

  const result = verifySignedImageRequest(url, SECRET);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'expired_signature');
});

test('verifySignedImageRequest rejects missing signature fields', () => {
  const url = new URL('https://example.com/api/images/places/list?query=Brandenburg%20Gate');
  const result = verifySignedImageRequest(url, SECRET);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_signature_fields');
});

