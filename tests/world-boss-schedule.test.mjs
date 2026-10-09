import assert from 'node:assert/strict';
import { test } from 'node:test';
import { timerState, upcomingOccurrences, formatTimerMoment } from '../timer-schedule.js';
import * as bosses from '../world-boss-schedule.js';

const at = value => Date.parse(value);
const now = at('2026-10-09T17:00:00Z');
test('Global list contains the five sourced Abyss bosses only', () => {
  assert.deepEqual(bosses.WORLD_BOSSES?.map(boss => boss.id), ['watcher-kaira', 'executor-argo', 'executor-kaira', 'executor-tamasa', 'abyss-siege-boss']);
});
test('Watcher Kaira retains its 01:00 GMT+9 anchor across a UTC day boundary', () => {
  const kaira = bosses.WORLD_BOSSES.find(boss => boss.id === 'watcher-kaira');
  assert.equal(timerState(kaira, at('2026-10-09T15:59:59Z')).next, at('2026-10-09T16:00:00Z'));
  assert.equal(timerState(kaira, at('2026-10-09T16:00:01Z')).next, at('2026-10-09T19:00:00Z'));
});
test('executor weekdays and siege weekdays retain source time through display DST', () => {
  const executor = bosses.WORLD_BOSSES.find(boss => boss.id === 'executor-argo');
  const siege = bosses.WORLD_BOSSES.find(boss => boss.id === 'abyss-siege-boss');
  assert.deepEqual(upcomingOccurrences(executor, now, 3), ['2026-10-10T12:30:00Z', '2026-10-12T12:30:00Z', '2026-10-15T12:30:00Z'].map(at));
  assert.deepEqual(upcomingOccurrences(siege, now, 2), ['2026-10-11T12:00:00Z', '2026-10-16T12:00:00Z'].map(at));
  assert.match(formatTimerMoment(timerState(executor, at('2026-11-02T00:00:00Z')).next, 'America/Chicago'), /6:30 AM CST/);
});
test('Gartua needs an observed kill and expires once, without repeating itself', () => {
  assert.deepEqual(bosses.gartuaState(null, now), { status: 'untracked', next: null });
  const record = bosses.createGartuaRecord(now - 3600000, now);
  assert.equal(bosses.gartuaState(record, now).next, now + 11 * 3600000);
  assert.equal(bosses.gartuaState(record, now + 11 * 3600000).status, 'elapsed');
  assert.equal(bosses.gartuaState(record, now + 48 * 3600000).next, now + 11 * 3600000);
});
test('kill record validation rejects future, invalid and wrong-server data', () => {
  for (const value of [NaN, Infinity, -1, 0, '', null, now + 1]) assert.throws(() => bosses.createGartuaRecord(value, now));
  const valid = bosses.createGartuaRecord(now, now);
  assert.deepEqual(bosses.readGartuaRecord(JSON.stringify(valid), now), valid);
  for (const value of ['{', 'null', '[]', '{}', JSON.stringify({ ...valid, server: 'Other' }), JSON.stringify({ ...valid, version: 9 }), JSON.stringify({ ...valid, killedAt: now + 1 })]) {
    assert.equal(bosses.readGartuaRecord(value, now), null);
  }
});
