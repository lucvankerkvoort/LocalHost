import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applySyntheticGuardrails,
  buildSyntheticFallback,
  generateSyntheticHostReply,
} from './responder';

test('applySyntheticGuardrails rejects off-platform payment/contact prompts', () => {
  const blocked = applySyntheticGuardrails('Send me your WhatsApp and we can do PayPal off-platform.');
  assert.equal(blocked, null);
});

test('applySyntheticGuardrails rejects explicit human claims', () => {
  const blocked = applySyntheticGuardrails('I am human and definitely not a bot.');
  assert.equal(blocked, null);
});

test('buildSyntheticFallback always discloses automation', () => {
  const fallback = buildSyntheticFallback('FRIENDLY');
  assert.match(fallback, /automated host assistant/i);
});

test('generateSyntheticHostReply creates style-constrained, safe message', () => {
  const reply = generateSyntheticHostReply({
    hostName: 'Maria',
    style: 'CONCISE',
    guestMessage: 'What time should we arrive?',
    bookingDate: new Date('2026-04-01T00:00:00.000Z'),
    recentMessages: [],
  });

  assert.match(reply, /automated host assistant/i);
  assert.match(reply, /2026-04-01/);
  assert.ok(reply.length <= 320);
});
