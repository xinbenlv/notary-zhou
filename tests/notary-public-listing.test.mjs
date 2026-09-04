import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getNextNotaryRefreshAt,
  parseGeneratedAt,
} from '../src/lib/notary-public-listing.mjs';

test('schedules 07:00 Pacific during daylight saving time', () => {
  assert.equal(
    getNextNotaryRefreshAt(new Date('2026-08-28T13:00:00.000Z')).toISOString(),
    '2026-08-28T14:00:00.000Z',
  );
  assert.equal(
    getNextNotaryRefreshAt(new Date('2026-08-28T15:00:00.000Z')).toISOString(),
    '2026-08-29T14:00:00.000Z',
  );
  assert.equal(
    getNextNotaryRefreshAt(new Date('2026-08-28T14:00:00.000Z')).toISOString(),
    '2026-08-29T14:00:00.000Z',
  );
});

test('schedules correctly across the spring DST transition', () => {
  assert.equal(
    getNextNotaryRefreshAt(new Date('2026-03-08T13:30:00.000Z')).toISOString(),
    '2026-03-08T14:00:00.000Z',
  );
});

test('schedules correctly across the fall DST transition', () => {
  assert.equal(
    getNextNotaryRefreshAt(new Date('2026-11-01T14:30:00.000Z')).toISOString(),
    '2026-11-01T15:00:00.000Z',
  );
});

test('parses the official README generation time as Pacific time', () => {
  const readme =
    'The notary public data available in the attached file was generated on:  ' +
    'Friday, August 28, 2026 at:  6:00 AM';
  assert.equal(parseGeneratedAt(readme), '2026-08-28T13:00:00.000Z');
});
