import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateSchedule, statusFor, selectEvents, formatMoment, formatDate, isStale } from '../event-schedule.js';

const now = new Date('2026-10-04T22:00:00Z');
const exact = { id: 'test', kind: 'drops', title: 'Test', summary: 'Test campaign', start_date: '2026-10-02', end_date: '2026-10-04', starts_at: '2026-10-02T19:00:00Z', ends_at: '2026-10-05T06:59:00Z', claim_by: '2026-10-31T06:59:00Z', source_url: 'https://aion2.plaync.com/en-us/board/notice', participation: 'Watch participating streams.', rewards: ['Pet'] };
const manifest = events => ({ schema_version: 1, verified_at: now.toISOString(), events });

test('watch cutoff ends earning while earned rewards can still be claimed', () => {
  assert.equal(statusFor(exact, now), 'ending');
  assert.equal(statusFor(exact, new Date(exact.ends_at)), 'claim');
  assert.equal(statusFor(exact, new Date(exact.claim_by)), 'ended');
});
test('unconfirmed date windows never become live or get a guessed deadline', () => {
  const event = { ...exact, starts_at: undefined, ends_at: undefined, claim_by: undefined, start_date: '2026-10-07', end_date: '2026-10-09' };
  assert.equal(statusFor(event, now), 'upcoming');
  assert.equal(statusFor(event, new Date('2026-10-08T18:00:00Z')), 'scheduled');
  assert.equal(statusFor(event, new Date('2026-10-10T10:00:00Z')), 'scheduled');
  assert.equal(statusFor(event, new Date('2026-10-10T12:00:00Z')), 'past-window');
});
test('confirmed future starts stay upcoming, even with a nearby end', () => {
  assert.equal(statusFor({ ...exact, starts_at: '2026-10-05T00:00:00Z' }, now), 'upcoming');
});
test('filters and preview exclude ended earning windows and keep urgent events first', () => {
  const future = { ...exact, id: 'future', start_date: '2026-10-12', end_date: '2026-10-14', starts_at: undefined, ends_at: undefined };
  const expired = { ...exact, id: 'expired', ends_at: '2026-10-03T00:00:00Z' };
  const game = { ...exact, id: 'game', kind: 'in-game' };
  assert.deepEqual(selectEvents([future, expired, exact, game], { now, kind: 'drops' }).map(x => x.id), ['test', 'future']);
  assert.deepEqual(selectEvents([future, expired, exact], { now, section: 'claim' }).map(x => x.id), ['expired']);
});
test('Central time handles DST and date-only labels do not shift a day', () => {
  assert.match(formatMoment('2026-10-05T06:59:00Z'), /Oct 5, 2026.*1:59 AM CDT/);
  assert.match(formatMoment('2026-12-02T07:30:00Z'), /Dec 2, 2026.*1:30 AM CST/);
  assert.equal(formatDate('2026-10-05'), 'Oct 5, 2026');
});
test('stale verification is detectable independently of event status', () => {
  assert.equal(isStale('2026-10-04T12:00:00Z', now), false);
  assert.equal(isStale('2026-10-01T12:00:00Z', now), true);
});
test('manifest rejects invalid dates, chronology, duplicate IDs and untrusted URLs', () => {
  assert.doesNotThrow(() => validateSchedule(manifest([exact])));
  for (const change of [{ ends_at: 'tomorrow' }, { start_date: '2026-02-30' }, { source_url: 'javascript:alert(1)' }, { action_url: 'https://aion2.plaync.com.evil.example/' }, { ends_at: '2026-10-01T00:00:00Z' }, { claim_by: '2026-10-03T00:00:00Z' }]) {
    assert.throws(() => validateSchedule(manifest([{ ...exact, ...change }])));
  }
  assert.throws(() => validateSchedule(manifest([exact, exact])));
});
test('published schedule passes the same validation used by the browser and monitor', async () => {
  validateSchedule(JSON.parse(await readFile(new URL('../events.json', import.meta.url), 'utf8')));
});
