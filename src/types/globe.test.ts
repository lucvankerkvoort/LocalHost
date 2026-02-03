import assert from 'node:assert/strict';
import test from 'node:test';

import { DAY_COLORS, generateId, getColorForDay } from './globe';

test('generateId returns unique string values', () => {
  const first = generateId();
  const second = generateId();

  assert.notEqual(first, second);
  assert.ok(first.includes('-'));
  assert.ok(second.includes('-'));
});

test('getColorForDay returns first color for day 1', () => {
  assert.equal(getColorForDay(1), DAY_COLORS[0]);
});

test('getColorForDay returns last palette color for last day in cycle', () => {
  assert.equal(getColorForDay(DAY_COLORS.length), DAY_COLORS[DAY_COLORS.length - 1]);
});

test('getColorForDay wraps around after palette length', () => {
  assert.equal(getColorForDay(DAY_COLORS.length + 1), DAY_COLORS[0]);
});
