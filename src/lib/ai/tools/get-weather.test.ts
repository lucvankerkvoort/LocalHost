import assert from 'node:assert/strict';
import test from 'node:test';

import { getWeatherTool } from './get-weather';

test('getWeatherTool rejects invalid date ranges', async () => {
  const result = await getWeatherTool.handler({
    location: 'Paris',
    startDate: '2026-03-10',
    endDate: '2026-03-01',
  });

  assert.equal(result.success, false);
  if (result.success) return;

  assert.equal(result.code, 'INVALID_DATE_RANGE');
});

test('getWeatherTool caps forecasts at 14 days', async () => {
  const result = await getWeatherTool.handler({
    location: 'Tokyo',
    startDate: '2026-01-01',
    endDate: '2026-02-15',
  });

  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.data.forecast.length, 14);
  assert.equal(result.data.location, 'Tokyo');
});

test('getWeatherTool is deterministic for same location/date inputs', async () => {
  const params = {
    location: 'Barcelona',
    startDate: '2026-04-01',
    endDate: '2026-04-03',
  };

  const first = await getWeatherTool.handler(params);
  const second = await getWeatherTool.handler(params);

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  if (!first.success || !second.success) return;

  assert.deepEqual(first.data.forecast, second.data.forecast);
  assert.equal(first.data.summary, second.data.summary);
});

