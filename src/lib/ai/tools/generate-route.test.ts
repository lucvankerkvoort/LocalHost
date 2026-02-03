import assert from 'node:assert/strict';
import test from 'node:test';

import { generateRouteTool } from './generate-route';

test('generateRouteTool auto-switches long walking legs to transit', async () => {
  const result = await generateRouteTool.handler({
    waypoints: [
      { name: 'Start', lat: 0, lng: 0 },
      { name: 'Far', lat: 0, lng: 0.03 },
    ],
    mode: 'walk',
    optimizeOrder: false,
  });

  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.data.segments.length, 1);
  assert.equal(result.data.segments[0].mode, 'transit');
  assert.ok(result.data.totalDistanceMeters > 2000);
});

test('generateRouteTool keeps explicit drive mode and emits drive instructions', async () => {
  const result = await generateRouteTool.handler({
    waypoints: [
      { name: 'A', lat: 48.8566, lng: 2.3522 },
      { name: 'B', lat: 48.8666, lng: 2.3622 },
    ],
    mode: 'drive',
    optimizeOrder: false,
  });

  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.data.segments[0].mode, 'drive');
  assert.equal(result.data.segments[0].instructions.startsWith('Drive '), true);
});

test('generateRouteTool optimizeOrder reorders remaining waypoints by nearest neighbor', async () => {
  const result = await generateRouteTool.handler({
    waypoints: [
      { name: 'Start', lat: 0, lng: 0 },
      { name: 'Far', lat: 0, lng: 2 },
      { name: 'Near', lat: 0, lng: 0.1 },
    ],
    mode: 'drive',
    optimizeOrder: true,
  });

  assert.equal(result.success, true);
  if (!result.success) return;

  assert.deepEqual(
    result.data.waypoints.map((waypoint) => waypoint.name),
    ['Start', 'Near', 'Far']
  );
});

