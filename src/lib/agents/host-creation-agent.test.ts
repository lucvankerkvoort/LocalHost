import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HOST_CREATION_MAX_STEPS,
  HOST_CREATION_STAGE_OPENERS,
  HOST_ONBOARDING_START_TOKEN,
  buildHostCreationSystemPrompt,
  isHostOnboardingStartTrigger,
  pickHostOnboardingOpener,
  prepareHostCreationConversation,
} from './host-creation-agent';

test('isHostOnboardingStartTrigger detects onboarding token with and without stage suffix', () => {
  assert.equal(
    isHostOnboardingStartTrigger([
      { role: 'user', content: HOST_ONBOARDING_START_TOKEN },
    ]),
    true
  );
  assert.equal(
    isHostOnboardingStartTrigger([
      { role: 'user', content: `${HOST_ONBOARDING_START_TOKEN}:DETAILS_MISSING` },
    ]),
    true
  );
  assert.equal(
    isHostOnboardingStartTrigger([{ role: 'user', content: 'Hi there' }]),
    false
  );
});

test('pickHostOnboardingOpener is deterministic per stage/session and stage-appropriate', () => {
  const cityA = pickHostOnboardingOpener('CITY_MISSING', 'chat-a');
  const cityB = pickHostOnboardingOpener('CITY_MISSING', 'chat-a');
  const details = pickHostOnboardingOpener('DETAILS_MISSING', 'chat-a');

  assert.equal(cityA, cityB);
  assert.ok(HOST_CREATION_STAGE_OPENERS.CITY_MISSING.includes(cityA));
  assert.ok(HOST_CREATION_STAGE_OPENERS.DETAILS_MISSING.includes(details));
  assert.match(cityA.toLowerCase(), /city/);
  assert.doesNotMatch(details.toLowerCase(), /\bwhat city\b/);
});

test('prepareHostCreationConversation rewrites stage trigger into onboarding starter message', () => {
  const prepared = prepareHostCreationConversation(
    [{ role: 'user', content: `${HOST_ONBOARDING_START_TOKEN}:DETAILS_MISSING` }],
    'chat-become_host-draft-123'
  );

  assert.equal(prepared.onboardingTriggered, true);
  assert.equal(prepared.onboardingStage, 'DETAILS_MISSING');
  assert.ok(prepared.opener);
  assert.equal(prepared.messages.length, 1);
  const rewritten = prepared.messages[0];
  assert.equal(rewritten.role, 'user');
  assert.match(String(rewritten.content), /DETAILS_MISSING/);
  assert.doesNotMatch(String(rewritten.content), /ACTION:START_HOST_ONBOARDING/);
});

test('prepareHostCreationConversation falls back to context stage for unsuffixed trigger', () => {
  const prepared = prepareHostCreationConversation(
    [{ role: 'user', content: HOST_ONBOARDING_START_TOKEN }],
    'chat-become_host-draft-123',
    'READY_FOR_ASSIST'
  );

  assert.equal(prepared.onboardingTriggered, true);
  assert.equal(prepared.onboardingStage, 'READY_FOR_ASSIST');
  assert.ok(
    HOST_CREATION_STAGE_OPENERS.READY_FOR_ASSIST.includes(prepared.opener || '')
  );
});

test('buildHostCreationSystemPrompt includes stage and opener guidance', () => {
  const prompt = buildHostCreationSystemPrompt({
    onboardingTriggered: true,
    onboardingStage: 'STOPS_MISSING',
    opener: 'Opener question?',
  });

  assert.match(prompt, /Perfect Day/i);
  assert.match(prompt, /CURRENT STAGE: STOPS_MISSING/i);
  assert.match(prompt, /Do not ask for city again/i);
  assert.match(prompt, /Opener question\?/i);
  assert.match(prompt, /After any tool call except completeProfile/i);
  assert.match(prompt, /Never end a turn with tool calls only/i);
  assert.match(prompt, /ask a clarification question instead of guessing/i);
  assert.match(prompt, /updateStopByName/i);
  assert.match(prompt, /removeStopByName/i);
  assert.match(prompt, /reorderStops/i);
});

test('host creation multi-step cap is explicitly configured', () => {
  assert.equal(HOST_CREATION_MAX_STEPS, 5);
});
