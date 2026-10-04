import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateSchedule } from '../event-schedule.js';

const origin = process.argv[2] || 'https://exalted-aion2.vercel.app';
const normalize = value => value.replace(/\r\n/g, '\n');
async function get(path) {
  const response = await fetch(new URL(path, origin), { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, `${path} must be available`);
  return response.text();
}
const [home, page, manifest] = await Promise.all([get('/'), get('/events'), get('/events.json')]);
assert.match(home, /href="\/events"/);
assert.match(home, /data-events-preview/);
assert.match(page, /data-events-page/);
assert.match(page, /data-event-list="claim"/);
assert.match(page, /https:\/\/exalted-aion2\.vercel\.app\/events/);
const data = validateSchedule(JSON.parse(manifest));
assert.deepEqual(data, JSON.parse(await readFile(new URL('../events.json', import.meta.url), 'utf8')), 'Deployed schedule must match reviewed local data');
for (const path of ['/events.js', '/event-schedule.js', '/events.css']) {
  assert.equal(normalize(await get(path)), normalize(await readFile(new URL(`..${path}`, import.meta.url), 'utf8')), `${path} must match the reviewed implementation`);
}
console.log(JSON.stringify({ origin, verified: true, events: data.events.length, sources_checked: data.verified_at }));
