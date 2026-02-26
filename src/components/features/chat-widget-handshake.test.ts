import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HOST_ONBOARDING_START_TOKEN,
  buildHostOnboardingTrigger,
  getChatId,
  getChatIntent,
  getTripIdFromPath,
  getHostToolOnlyFallbackQuestion,
  resolveHostOnboardingStage,
  shouldStartHostOnboardingHandshake,
} from './chat-widget-handshake';

test('getChatIntent only enables become_host on /become-host routes', () => {
  assert.equal(getChatIntent('/become-host/abc'), 'become_host');
  assert.equal(getChatIntent('/experiences/123/availability'), 'general');
  assert.equal(getChatIntent('/'), 'general');
});

test('getChatId uses draft-scoped chat ids for become_host sessions', () => {
  assert.equal(getChatId('become_host', '/become-host/draft-1'), 'chat-become_host-draft-1');
  assert.equal(getChatId('become_host', '/become-host', 'trip-1'), 'chat-become_host');
  assert.equal(getChatId('general', '/become-host/draft-1'), 'chat-general');
});

test('getChatId scopes general chat ids by tripId when provided', () => {
  assert.equal(getChatId('general', '/trips/trip-1', 'trip-1'), 'chat-general-trip-1');
  assert.equal(getChatId('general', '/trips/trip-2', '  trip-2  '), 'chat-general-trip-2');
  assert.equal(getChatId('general', '/trips/trip-3', null), 'chat-general');
});

test('getTripIdFromPath extracts trip ids only from trip detail routes', () => {
  assert.equal(getTripIdFromPath('/trips/trip-1'), 'trip-1');
  assert.equal(getTripIdFromPath('/trips/trip-2/plan'), 'trip-2');
  assert.equal(getTripIdFromPath('/'), null);
  assert.equal(getTripIdFromPath('/become-host/draft-1'), null);
});

test('shouldStartHostOnboardingHandshake gates handshake correctly', () => {
  const base = {
    intent: 'become_host' as const,
    isActive: true,
    pathname: '/become-host/draft-1',
    messageCount: 0,
    alreadyTriggered: false,
    isDraftReady: true,
  };

  assert.equal(shouldStartHostOnboardingHandshake(base), true);
  assert.equal(
    shouldStartHostOnboardingHandshake({ ...base, messageCount: 1 }),
    false
  );
  assert.equal(
    shouldStartHostOnboardingHandshake({ ...base, pathname: '/trips/abc' }),
    false
  );
  assert.equal(
    shouldStartHostOnboardingHandshake({ ...base, intent: 'general' }),
    false
  );
  assert.equal(
    shouldStartHostOnboardingHandshake({ ...base, alreadyTriggered: true }),
    false
  );
  assert.equal(
    shouldStartHostOnboardingHandshake({ ...base, isDraftReady: false }),
    false
  );
});

test('shouldStartHostOnboardingHandshake remains false on repeated checks after trigger (strict-mode safe)', () => {
  const initial = shouldStartHostOnboardingHandshake({
    intent: 'become_host',
    isActive: true,
    pathname: '/become-host/draft-1',
    messageCount: 0,
    alreadyTriggered: false,
    isDraftReady: true,
  });
  const repeated = shouldStartHostOnboardingHandshake({
    intent: 'become_host',
    isActive: true,
    pathname: '/become-host/draft-1',
    messageCount: 0,
    alreadyTriggered: true,
    isDraftReady: true,
  });

  assert.equal(initial, true);
  assert.equal(repeated, false);
});

test('resolveHostOnboardingStage resolves deterministic state progression', () => {
  assert.equal(
    resolveHostOnboardingStage({
      city: null,
      stops: [],
      title: null,
      shortDesc: null,
      longDesc: null,
    }),
    'CITY_MISSING'
  );
  assert.equal(
    resolveHostOnboardingStage({
      city: 'Lisbon',
      stops: [],
      title: null,
      shortDesc: null,
      longDesc: null,
    }),
    'STOPS_MISSING'
  );
  assert.equal(
    resolveHostOnboardingStage({
      city: 'Lisbon',
      stops: [{}],
      title: '  ',
      shortDesc: 'Short copy',
      longDesc: 'Long copy',
    }),
    'DETAILS_MISSING'
  );
  assert.equal(
    resolveHostOnboardingStage({
      city: 'Lisbon',
      stops: [{}],
      title: 'Sunrise Walk',
      shortDesc: 'Short copy',
      longDesc: 'Long copy',
    }),
    'READY_FOR_ASSIST'
  );
});

test('buildHostOnboardingTrigger appends stage to the onboarding token', () => {
  assert.equal(
    buildHostOnboardingTrigger('DETAILS_MISSING'),
    `${HOST_ONBOARDING_START_TOKEN}:DETAILS_MISSING`
  );
});

test('getHostToolOnlyFallbackQuestion returns stage-aware fallback copy', () => {
  assert.equal(
    getHostToolOnlyFallbackQuestion('CITY_MISSING'),
    'Great start - what city are you hosting in?'
  );
  assert.equal(
    getHostToolOnlyFallbackQuestion('STOPS_MISSING'),
    'Nice - what should be your first meaningful stop?'
  );
  assert.equal(
    getHostToolOnlyFallbackQuestion('DETAILS_MISSING'),
    'Want me to draft your title and descriptions from your current stops?'
  );
  assert.equal(
    getHostToolOnlyFallbackQuestion('READY_FOR_ASSIST'),
    'Everything core is set - what should we refine next?'
  );
});
