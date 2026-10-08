import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalGuideUrl, filterGuides, validateLibrary } from '../guide-library.js';
import { collectGuideLinks, readChannelHistory } from '../scripts/builds-scan-core.mjs';

test('YouTube short, watch, embed and tracking variants deduplicate', () => {
  for (const url of ['https://youtu.be/COrI0hUcFng?si=tracking', 'https://www.youtube.com/watch?v=COrI0hUcFng&t=25', 'https://youtube.com/embed/COrI0hUcFng']) {
    assert.equal(canonicalGuideUrl(url), 'https://www.youtube.com/watch?v=COrI0hUcFng');
  }
});
test('public links preserve meaningful build parameters and fragments but remove tracking', () => {
  assert.equal(canonicalGuideUrl('https://questlog.gg/build?utm_source=discord&build=123#skills'), 'https://questlog.gg/build?build=123#skills');
});
test('unsafe or private links cannot enter the public library', () => {
  for (const url of ['javascript:alert(1)', 'http://example.com', 'https://localhost/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://name:secret@example.com/a', 'https://example.com/a?token=secret', 'https://discord.com/channels/1/2', 'https://cdn.discordapp.com/attachments/a', 'https://example.com/a.exe']) assert.equal(canonicalGuideUrl(url), null, url);
});
test('Discord links deduplicate across messages and embeds without copying authors or message content', () => {
  const result = collectGuideLinks([
    { id: '1', timestamp: '2026-10-01T00:00:00Z', author: { username: 'private' }, content: '[Watch](https://youtu.be/COrI0hUcFng?si=abc)', embeds: [{ url: 'https://www.youtube.com/watch?v=COrI0hUcFng', title: 'Video title' }] },
    { id: '2', timestamp: '2026-10-02T00:00:00Z', content: 'https://www.youtube.com/watch?v=COrI0hUcFng' }
  ]);
  assert.equal(result.length, 1); assert.deepEqual(result[0].message_ids, ['1', '2']);
  assert.equal(result[0].shared_at, '2026-10-01T00:00:00Z'); assert.equal(result[0].title_hint, 'Video title');
  assert.ok(!JSON.stringify(result).includes('private'));
});
test('history scanner follows pages beyond 100 messages and fails on incomplete history', async () => {
  const page = Array.from({ length: 100 }, (_, index) => ({ id: String(200 - index) }));
  const cursors = [];
  assert.equal((await readChannelHistory(async before => { cursors.push(before); return before ? [{ id: '100' }] : page; })).length, 101);
  assert.deepEqual(cursors, [undefined, '101']);
  await assert.rejects(readChannelHistory(async before => { if (before) throw Error('HTTP 403'); return page; }), /403/);
  await assert.rejects(readChannelHistory(async () => page), /Repeated/);
});
test('search and category/class filters combine, with general guides available to every class', () => {
  const links = [
    { id: '1', title: 'Sorcerer build', description: 'Skills', source: 'Source', category: 'builds', format: 'article', classes: ['Sorcerer'], tags: [], shared_at: '2026-10-01' },
    { id: '2', title: 'Gear guide', description: 'Progression', source: 'Source', category: 'guides', format: 'video', classes: [], tags: [], shared_at: '2026-10-02' }
  ];
  assert.equal(filterGuides(links, { className: 'Cleric' }).length, 1);
  assert.equal(filterGuides(links, { category: 'builds', className: 'Cleric' }).length, 0);
  assert.equal(filterGuides(links, { query: 'GEAR video' })[0].id, '2');
  assert.equal(filterGuides(links)[0].id, '2');
});
test('published manifest is valid and duplicate links fail validation', async () => {
  const data = JSON.parse(await readFile(new URL('../builds.json', import.meta.url), 'utf8'));
  assert.equal(validateLibrary(data), data);
  assert.throws(() => validateLibrary({ ...data, links: [...data.links, { ...data.links[0], id: 'duplicate' }] }), /duplicate guide URL/);
  assert.throws(() => validateLibrary({ ...data, links: [{ ...data.links[0], author_id: 'private' }] }), /Unexpected public guide field/);
});
