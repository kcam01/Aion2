import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as directory from '../member-directory-data.js';

const member = { slug: 'main', name: 'KcamYazimoto', className: 'Cleric', serverId: '2106', serverName: 'Azphel', region: 'nae', portrait: '' };
const profile = { profile: { characterName: 'KcamYazimoto', serverId: 2106, characterLevel: 38, combatPower: 49224, className: 'Cleric', titleName: 'Celebrity' }, stat: { statList: [{ type: 'ItemLevel', value: 962 }] } };
test('directory uses reported item level separately from combat power', () => {
  assert.deepEqual(directory.normalizeDirectoryProfile(profile, member), { level: 38, itemLevel: 962, combatPower: 49224, title: 'Celebrity' });
});
test('invalid or absent stats remain unknown, while zero is preserved', () => {
  const raw = { profile: { ...profile.profile, characterLevel: null, combatPower: 0 }, stat: { statList: [{ type: 'ItemLevel', value: '' }] } };
  assert.deepEqual(directory.normalizeDirectoryProfile(raw, member), { level: null, itemLevel: null, combatPower: 0, title: 'Celebrity' });
  for (const invalid of [true, [], {}, -10, 'invalid', Infinity]) {
    assert.equal(directory.normalizeDirectoryProfile({ profile: { ...profile.profile, combatPower: invalid } }, member).combatPower, null);
  }
});
test('wrong character, wrong server and malformed profiles cannot supply row stats', () => {
  for (const raw of [{}, { profile: {} }, { profile: { ...profile.profile, characterName: 'SomeoneElse' } }, { profile: { ...profile.profile, serverId: 2102 } }]) {
    assert.throws(() => directory.normalizeDirectoryProfile(raw, member));
  }
});
test('linked alts are optional and keep their main association and profile identity', () => {
  const rows = directory.createDirectoryRows([{ ...member, alts: [{ ...member, slug: 'alt', name: 'KcamAlt', className: 'Templar' }] }]);
  assert.equal(rows.length, 2);
  assert.deepEqual(directory.selectDirectoryRows(rows).map(row => row.slug), ['main']);
  const all = directory.selectDirectoryRows(rows, { includeAlts: true });
  assert.equal(all.length, 2);
  assert.equal(all.find(row => row.slug === 'alt').mainName, 'KcamYazimoto');
});
const rows = [
  { slug: 'b', name: 'Member10', className: 'Cleric', serverName: 'Azphel', level: 45, itemLevel: 1100, combatPower: 500, mainSlug: null },
  { slug: 'a', name: 'Member2', className: 'Templar', serverName: 'Azphel', level: 38, itemLevel: 962, combatPower: 0, mainSlug: null },
  { slug: 'c', name: 'Alpha', className: 'Cleric', serverName: 'Azphel', level: null, itemLevel: null, combatPower: null, mainSlug: null },
];
test('numeric sorts are numeric, stable and keep unknown stats last both ways', () => {
  assert.deepEqual(directory.selectDirectoryRows(rows, { sort: 'itemLevel', direction: 'asc' }).map(row => row.slug), ['a', 'b', 'c']);
  assert.deepEqual(directory.selectDirectoryRows(rows, { sort: 'itemLevel', direction: 'desc' }).map(row => row.slug), ['b', 'a', 'c']);
  assert.deepEqual(directory.selectDirectoryRows(rows, { sort: 'combatPower', direction: 'asc' }).map(row => row.slug), ['a', 'b', 'c']);
  assert.equal(rows[0].slug, 'b');
});
test('name sorting is natural and search combines with class and alt filters', () => {
  assert.deepEqual(directory.selectDirectoryRows(rows, { sort: 'name', direction: 'asc' }).map(row => row.name), ['Alpha', 'Member2', 'Member10']);
  assert.deepEqual(directory.selectDirectoryRows(rows, { query: ' MEMBER ', className: 'Cleric' }).map(row => row.slug), ['b']);
  assert.equal(directory.selectDirectoryRows(rows, { query: 'missing' }).length, 0);
});
