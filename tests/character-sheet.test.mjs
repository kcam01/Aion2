import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSheet, appendHistory, parseHistory, safeImage } from '../character-sheet.js';

test('item level is separate from primary and divine attributes, including zero values', () => {
  const sheet = buildSheet({ profile: { characterLevel: 25 }, stat: { statList: [
    { type: 'STR', name: 'Might', value: 0 }, { type: 'Justice', name: 'Justice [Nezekan]', value: 4, statSecondList: ['Defense +0.4%'] },
    { type: 'ItemLevel', value: 484 },
  ] } }, {});
  assert.equal(sheet.itemLevel, 484);
  assert.equal(sheet.primary[0].value, 0);
  assert.equal(sheet.primary[1].value, null);
  assert.equal(sheet.divine.length, 1);
  assert.equal(sheet.divine[0].deity, 'Nezekan');
  assert.deepEqual(sheet.divine[0].effects, ['Defense +0.4%']);
});

test('equipment follows the reference slot order and includes wings and pet without a made-up pet rarity', () => {
  const sheet = buildSheet({}, { equipment: { equipmentList: [
    { name: 'Cape', slotPosName: 'Cape', grade: 'Rare' },
    { name: 'Torso', slotPosName: 'Torso', grade: 'Legend' },
    { name: 'Helm', slotPosName: 'Helmet', grade: 'Legend' },
    { name: 'Mace', slotPosName: 'MainHand', enchantLevel: 8, grade: 'Rare' },
  ] }, petwing: { wing: { name: 'Wings', grade: 'Common' }, pet: { name: 'Armadon', level: 3 } } });
  assert.deepEqual(sheet.equipment.map(x => x.name), ['Mace', 'Helm', 'Torso', 'Cape', 'Wings', 'Armadon']);
  assert.equal(sheet.equipment[0].enchant, 8);
  assert.equal(sheet.equipment.at(-1).grade, '');
  assert.equal(sheet.equipment.at(-1).slot, 'Pet');
  assert.equal(sheet.equipment.at(-1).level, 3);
});

test('Daevanion uses reported counts and clamps meters without inventing missing progress', () => {
  const sheet = buildSheet({ daevanion: { boardList: [
    { name: 'Nezekan', openNodeCount: 35, totalNodeCount: 88, openPercent: 40 },
    { name: 'Zikel', openNodeCount: 500, totalNodeCount: 88, openPercent: 568 },
    { name: 'Unknown' },
  ] } }, {});
  assert.equal(sheet.boards[0].percent, 40);
  assert.equal(sheet.boards[1].percent, 100);
  assert.equal(sheet.boards[2].percent, null);
});

test('locked skills stay locked and equipped skills sort first in the preview', () => {
  const sheet = buildSheet({}, { skill: { skillList: [
    { name: 'Locked', acquired: 0, equip: 0, skillLevel: 0, category: 'Dp', needLevel: 22 },
    { name: 'Passive', acquired: 1, equip: 0, skillLevel: 5, category: 'Passive' },
    { name: 'Equipped', acquired: 1, equip: 1, skillLevel: 11, category: 'Active' },
  ] } });
  assert.deepEqual(sheet.skillPreview.map(x => x.name), ['Equipped', 'Passive']);
  assert.equal(sheet.skills[0].acquired, false);
  assert.equal(sheet.skills[0].category, 'DP');
});

test('missing data remains unknown instead of zero or fabricated rank', () => {
  const sheet = buildSheet(null, null, { name: 'Approved member', className: 'Cleric', serverName: 'Azphel' });
  assert.equal(sheet.name, 'Approved member');
  assert.equal(sheet.combatPower, null);
  assert.equal(sheet.itemLevel, null);
  assert.equal(sheet.level, null);
  assert.deepEqual(sheet.equipment, []);
  assert.deepEqual(sheet.boards, []);
});

test('only official HTTPS image hosts are accepted', () => {
  assert.equal(safeImage('javascript:alert(1)'), '');
  assert.equal(safeImage('https://assets.playnccdn.com.attacker.example/icon.png'), '');
  assert.equal(safeImage('https://assets.playnccdn.com/icon.png'), 'https://assets.playnccdn.com/icon.png');
});

test('browser history records changed complete observations only, keeps twenty, and rejects malformed storage', () => {
  const sheet = { level: 25, combatPower: 22792, itemLevel: 484 };
  const first = appendHistory([], sheet, '2026-10-05T17:00:00Z');
  assert.equal(first.length, 1);
  assert.deepEqual(appendHistory(first, sheet, '2026-10-05T18:00:00Z'), first);
  assert.deepEqual(appendHistory(first, { ...sheet, itemLevel: null }), first);
  const changed = appendHistory(first, { ...sheet, level: 26 }, '2026-10-05T19:00:00Z');
  assert.equal(changed[0].level, 26);
  assert.equal(changed.length, 2);
  assert.deepEqual(parseHistory('{bad'), []);
  assert.deepEqual(parseHistory('[{"checkedAt":"invalid","level":1}]'), []);
  assert.equal(appendHistory(Array.from({ length: 20 }, () => first[0]), { ...sheet, level: 30 }).length, 20);
});
