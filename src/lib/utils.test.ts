import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateAverageRating,
  cn,
  debounce,
  formatDate,
  formatDuration,
  formatGroupSize,
  formatPrice,
  formatRelativeTime,
  generateId,
  truncate,
} from './utils';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('cn joins class names and ignores falsy values', () => {
  assert.equal(cn('foo', false, undefined, 'bar', null), 'foo bar');
});

test('formatPrice formats cents as USD by default', () => {
  assert.equal(formatPrice(15000), '$150.00');
});

test('formatPrice formats other currencies', () => {
  assert.equal(formatPrice(10000, 'EUR'), '€100.00');
});

test('formatDuration handles minutes, exact hour, and mixed duration', () => {
  assert.equal(formatDuration(45), '45 min');
  assert.equal(formatDuration(60), '1h');
  assert.equal(formatDuration(90), '1h 30min');
});

test('formatDate formats date-like input', () => {
  const asString = formatDate('2026-01-01T00:00:00.000Z');
  const asDate = formatDate(new Date('2026-01-01T00:00:00.000Z'));
  assert.equal(asString, asDate);
});

test('formatRelativeTime returns just now / minutes / hours / days', () => {
  const now = Date.now();

  assert.equal(formatRelativeTime(new Date(now - 20 * 1000)), 'just now');
  assert.equal(formatRelativeTime(new Date(now - 5 * 60 * 1000)), '5m ago');
  assert.equal(formatRelativeTime(new Date(now - 3 * 60 * 60 * 1000)), '3h ago');
  assert.equal(formatRelativeTime(new Date(now - 2 * 24 * 60 * 60 * 1000)), '2d ago');
});

test('formatRelativeTime falls back to formatDate after one week', () => {
  const older = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  assert.equal(formatRelativeTime(older), formatDate(older));
});

test('truncate returns original under limit and ellipsis over limit', () => {
  assert.equal(truncate('short', 10), 'short');
  assert.equal(truncate('very long text', 10), 'very lo...');
});

test('generateId returns unique ids across calls', () => {
  const first = generateId();
  const second = generateId();

  assert.notEqual(first, second);
  assert.ok(first.length > 5);
  assert.ok(second.length > 5);
});

test('calculateAverageRating returns 0 for empty and rounds to one decimal', () => {
  assert.equal(calculateAverageRating([]), 0);
  assert.equal(calculateAverageRating([4, 5, 3]), 4);
  assert.equal(calculateAverageRating([4.33, 4.33, 4.34]), 4.3);
});

test('formatGroupSize handles singular, plural, and range', () => {
  assert.equal(formatGroupSize(1, 1), '1 person');
  assert.equal(formatGroupSize(2, 2), '2 people');
  assert.equal(formatGroupSize(2, 6), '2-6 people');
});

test('debounce executes only the last call after delay', async () => {
  const calls: string[] = [];
  const fn = debounce((value: string) => {
    calls.push(value);
  }, 20);

  fn('first');
  fn('second');
  fn('third');
  assert.equal(calls.length, 0);

  await sleep(35);

  assert.deepEqual(calls, ['third']);
});

test('cn supports object-style conditional classes', () => {
  assert.equal(cn('base', { active: true, hidden: false }), 'base active');
});

test('formatPrice handles zero cents', () => {
  assert.equal(formatPrice(0), '$0.00');
});

test('formatPrice handles negative cents', () => {
  assert.equal(formatPrice(-1234), '-$12.34');
});

test('formatDuration formats zero minutes', () => {
  assert.equal(formatDuration(0), '0 min');
});

test('formatDuration formats one hour plus one minute', () => {
  assert.equal(formatDuration(61), '1h 1min');
});

test('formatDate returns a non-empty string for valid date', () => {
  const value = formatDate(new Date('2026-06-01T12:00:00.000Z'));
  assert.equal(typeof value, 'string');
  assert.equal(value.length > 0, true);
});

test('formatRelativeTime keeps under-a-minute values as just now', () => {
  const now = Date.now();
  assert.equal(formatRelativeTime(new Date(now - 59 * 1000)), 'just now');
});

test('formatRelativeTime switches to minutes at 60 seconds', () => {
  const now = Date.now();
  assert.equal(formatRelativeTime(new Date(now - 60 * 1000)), '1m ago');
});

test('formatRelativeTime shows 59m ago at 59-minute boundary', () => {
  const now = Date.now();
  assert.equal(formatRelativeTime(new Date(now - 59 * 60 * 1000)), '59m ago');
});

test('formatRelativeTime switches to hours at 60-minute boundary', () => {
  const now = Date.now();
  assert.equal(formatRelativeTime(new Date(now - 60 * 60 * 1000)), '1h ago');
});

test('truncate keeps text unchanged when equal to max length', () => {
  assert.equal(truncate('12345', 5), '12345');
});

test('truncate returns only ellipsis when maxLength is 3', () => {
  assert.equal(truncate('abcdef', 3), '...');
});

test('calculateAverageRating handles single-value arrays', () => {
  assert.equal(calculateAverageRating([4.7]), 4.7);
});

test('formatGroupSize keeps numeric range formatting for non-equal bounds', () => {
  assert.equal(formatGroupSize(6, 2), '6-2 people');
});

test('debounce with zero delay still only executes latest call', async () => {
  const calls: string[] = [];
  const fn = debounce((value: string) => {
    calls.push(value);
  }, 0);

  fn('a');
  fn('b');
  await sleep(10);

  assert.deepEqual(calls, ['b']);
});
