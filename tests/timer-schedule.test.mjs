import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TIMERS, timerState, upcomingOccurrences, occurrencesOnDate, formatCountdown, formatTimerMoment, resolveTimeZone } from '../timer-schedule.js';

const timer = id => TIMERS.find(item => item.id === id);
const instant = value => new Date(value).getTime();

test('rift countdown rolls forward at the opening without a negative countdown', () => {
  const rift = timer('rift');
  assert.equal(timerState(rift, instant('2026-10-08T17:59:59Z')).next, instant('2026-10-08T18:00:00Z'));
  assert.equal(timerState(rift, instant('2026-10-08T18:00:00Z')).next, instant('2026-10-08T18:00:00Z'));
  assert.equal(timerState(rift, instant('2026-10-08T18:00:00.001Z')).next, instant('2026-10-08T21:00:00Z'));
  assert.equal(formatCountdown(-1000), '00:00:00');
  assert.equal(formatCountdown(1001), '00:00:02');
  assert.equal(formatCountdown(90061000), '1d 01:01:01');
});

test('Global resets convert from GMT+9 and retain the correct weekly day', () => {
  const now = instant('2026-10-07T07:00:01Z');
  assert.equal(timerState(timer('daily-reset'), now).next, instant('2026-10-08T07:00:00Z'));
  assert.equal(timerState(timer('weekly-reset'), now).next, instant('2026-10-14T07:00:00Z'));
});

test('Abyss uses source weekdays and 21:00 GMT+9, not 21:00 UTC', () => {
  const upcoming = upcomingOccurrences(timer('abyss'), instant('2026-10-08T12:10:00Z'), 3);
  assert.deepEqual(upcoming, ['2026-10-10T12:00:00Z', '2026-10-12T12:00:00Z', '2026-10-15T12:00:00Z'].map(instant));
});

test('activity windows include the start and exclude the end', () => {
  const raid = timer('air-raid');
  assert.equal(timerState(raid, instant('2026-10-08T17:29:59Z')).active, null);
  assert.deepEqual(timerState(raid, instant('2026-10-08T17:30:00Z')).active, { start: instant('2026-10-08T17:30:00Z'), end: instant('2026-10-08T17:43:00Z') });
  assert.equal(timerState(raid, instant('2026-10-08T17:43:00Z')).active, null);
  assert.equal(timerState(raid, instant('2026-10-08T17:43:00Z')).next, instant('2026-10-08T18:30:00Z'));
});

test('display-day slots handle UTC rollover and fractional timezone offsets', () => {
  const now = instant('2026-10-08T23:30:00Z');
  const slots = occurrencesOnDate(timer('rift'), now, 'Asia/Kolkata');
  assert.equal(slots.length, 8);
  assert.equal(slots[0], instant('2026-10-08T21:00:00Z'));
  assert.equal(slots.at(-1), instant('2026-10-09T18:00:00Z'));
});

test('local days respect spring and fall DST while the server stays fixed', () => {
  const hourly = { ...timer('rift'), minutes: Array.from({ length: 24 }, (_, i) => i * 60) };
  assert.equal(occurrencesOnDate(hourly, instant('2026-03-08T18:00:00Z'), 'America/Chicago').length, 23);
  assert.equal(occurrencesOnDate(hourly, instant('2026-11-01T18:00:00Z'), 'America/Chicago').length, 25);
  assert.match(formatTimerMoment(instant('2026-10-08T07:00:00Z'), 'America/Chicago'), /2:00 AM CDT/);
  assert.match(formatTimerMoment(instant('2026-12-08T07:00:00Z'), 'America/Chicago'), /1:00 AM CST/);
});

test('timezone preferences are validated and fall back safely', () => {
  assert.equal(resolveTimeZone('local', 'Pacific/Auckland'), 'Pacific/Auckland');
  assert.equal(resolveTimeZone('UTC'), 'UTC');
  assert.equal(resolveTimeZone('broken-zone'), 'America/Chicago');
  assert.equal(resolveTimeZone(null), 'America/Chicago');
});

test('catalog has unique keys, bounded minutes and sourced durations', () => {
  assert.equal(new Set(TIMERS.map(item => item.id)).size, TIMERS.length);
  assert.equal(TIMERS.length, 16);
  for (const item of TIMERS) {
    assert.ok(item.days.length && item.days.every(day => day >= 0 && day <= 6));
    assert.ok(item.minutes.length && item.minutes.every(minute => minute >= 0 && minute < 1440));
    assert.ok(item.durationSeconds >= 0);
    assert.ok(Number.isFinite(timerState(item, instant('2026-10-08T17:00:00Z')).next));
  }
});
