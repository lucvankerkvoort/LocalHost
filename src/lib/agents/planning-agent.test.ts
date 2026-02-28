import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPlannerRequest,
  detectItineraryReadIntent,
  detectItineraryUpdateIntent,
  extractItineraryRemovalTargets,
  getPlannerQuestion,
  removeItineraryTargetsFromStops,
} from './planning-agent';

test('buildPlannerRequest prefers road trip wording when driving between two cities', () => {
  const request = buildPlannerRequest({
    destinations: ['Los Angeles', 'Chicago'],
    destinationScope: 'multi_city',
    needsCities: false,
    mustSeeProvided: false,
    avoidProvided: false,
    foodPreferencesProvided: false,
    hasGenerated: true,
    hasFlown: true,
    transportPreference: 'drive',
    durationDays: 6,
  });

  assert.ok(request.includes('road trip from Los Angeles to Chicago'));
  assert.ok(request.includes('Include intermediate overnight cities'));
  assert.ok(request.includes('Do not use flights'));
});

test('buildPlannerRequest includes flight preference for multi-city trips', () => {
  const request = buildPlannerRequest({
    destinations: ['Amsterdam', 'Berlin', 'Rome'],
    destinationScope: 'multi_city',
    needsCities: false,
    mustSeeProvided: false,
    avoidProvided: false,
    foodPreferencesProvided: false,
    hasGenerated: true,
    hasFlown: true,
    transportPreference: 'flight',
  });

  assert.ok(request.includes('Prefer flights between cities'));
});

test('getPlannerQuestion returns destination prompt when empty', () => {
  const question = getPlannerQuestion(
    {
      destinations: [],
      destinationScope: 'unknown',
      needsCities: false,
      mustSeeProvided: false,
      avoidProvided: false,
      foodPreferencesProvided: false,
      hasGenerated: false,
      hasFlown: false,
    },
    ''
  );

  assert.equal(question?.key, 'destination');
});

test('detectItineraryUpdateIntent identifies removal edits on existing itinerary text', () => {
  assert.equal(
    detectItineraryUpdateIntent("I don't like Barstow in my itinerary, remove it"),
    true
  );
  assert.equal(detectItineraryUpdateIntent('Plan me a trip to Tokyo'), false);
});

test('detectItineraryReadIntent identifies itinerary context requests', () => {
  assert.equal(detectItineraryReadIntent('What is in my itinerary right now?'), true);
  assert.equal(detectItineraryReadIntent('Show me my current trip plan'), true);
  assert.equal(detectItineraryReadIntent('Plan me a trip to Tokyo'), false);
});

test('extractItineraryRemovalTargets parses disliked location from free text', () => {
  assert.deepEqual(
    extractItineraryRemovalTargets("I don't like Barstow in my itinerary"),
    ['Barstow']
  );
});

test('removeItineraryTargetsFromStops removes matching stop and keeps other stops', () => {
  const input = [
    {
      title: 'Los Angeles',
      type: 'CITY' as const,
      locations: [{ name: 'Los Angeles', lat: 34.05, lng: -118.24 }],
      days: [
        {
          dayIndex: 1,
          date: null,
          title: 'LA Highlights',
          suggestedHosts: [],
          items: [
            {
              type: 'SIGHT' as const,
              title: 'Griffith Observatory',
              description: null,
              startTime: null,
              endTime: null,
              locationName: 'Los Angeles',
              lat: 34.1,
              lng: -118.3,
              experienceId: null,
              hostId: null,
              createdByAI: true,
            },
          ],
        },
      ],
    },
    {
      title: 'Barstow',
      type: 'CITY' as const,
      locations: [{ name: 'Barstow', lat: 34.9, lng: -117.0 }],
      days: [
        {
          dayIndex: 2,
          date: null,
          title: 'Barstow Stopover',
          suggestedHosts: [],
          items: [
            {
              type: 'SIGHT' as const,
              title: 'Route 66 Museum',
              description: null,
              startTime: null,
              endTime: null,
              locationName: 'Barstow',
              lat: 34.9,
              lng: -117.0,
              experienceId: null,
              hostId: null,
              createdByAI: true,
            },
          ],
        },
      ],
    },
  ];

  const result = removeItineraryTargetsFromStops(input, ['Barstow']);
  assert.equal(result.stops.length, 1);
  assert.equal(result.stops[0].title, 'Los Angeles');
  assert.deepEqual(result.stats.removedStops, ['Barstow']);
});
