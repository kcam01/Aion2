import test from 'node:test';
import assert from 'node:assert/strict';
import { itemId, shardPath, questlogUrl, itemPageUrl, findItem, validateItem, RARITIES } from '../item-data.js';

const ICON = 'https://assets.playnccdn.com/static-aion2-gamedata/resources/Icon_WP_MA_0078_T05.png';
const MACE = {
  id: '110730048', name: 'Spiritforged Mace', grade: 'Unique', rarity: 'unique', type: 'Mace', category: 'Weapon',
  icon: ICON, itemLevel: 45, requiredLevel: 45, sellPrice: 1234,
  stats: [{ label: 'Attack', value: '160 ~ 206' }, { label: 'Block', value: '50' }],
  randomStats: { picks: 3, stats: [{ label: 'Combat Speed', value: '11.2% – 13%' }] },
};
const shard = items => ({ version: 1, items });

test('item IDs are 1-12 plain digits', () => {
  assert.equal(itemId('110730048'), '110730048');
  for (const bad of ['', ' 1', '1.5', '-1', '1234567890123', '12a', null, undefined, 110730048]) assert.equal(itemId(bad), null);
});

test('shards are keyed by the last two digits of the ID', () => {
  assert.equal(shardPath('110730048'), '/items/48.json');
  assert.equal(shardPath('110230010'), '/items/10.json');
  assert.equal(shardPath('7'), '/items/07.json');
});

test('links point to questlog and the Exalted item page', () => {
  assert.equal(questlogUrl('110730048'), 'https://questlog.gg/aion-2/en/db/item/110730048');
  assert.equal(itemPageUrl('110730048'), '/item?id=110730048');
});

test('a complete record is accepted, frozen, and keeps stat order', () => {
  const item = findItem(shard({ '110730048': MACE }), '110730048');
  assert.equal(item.name, 'Spiritforged Mace');
  assert.deepEqual(item.stats.map(s => s.label), ['Attack', 'Block']);
  assert.equal(item.randomStats.picks, 3);
  assert.ok(Object.isFrozen(item) && Object.isFrozen(item.stats) && Object.isFrozen(item.randomStats.stats));
});

test('optional sections may be absent', () => {
  const potion = { id: '160000001', name: 'Healing Potion', grade: 'Common', rarity: 'common', type: 'Potion', category: 'Usable' };
  const item = findItem(shard({ '160000001': potion }), '160000001');
  assert.equal(item.icon, undefined);
  assert.equal(item.stats, undefined);
  assert.equal(item.randomStats, undefined);
});

test('a missing ID returns null; an invalid snapshot throws', () => {
  assert.equal(findItem(shard({}), '110730048'), null);
  for (const bad of [null, [], { version: 2, items: {} }, { version: 1, items: [] }, { version: 1 }]) {
    assert.throws(() => findItem(bad, '110730048'));
  }
});

test('records with unexpected or unsafe values are rejected', () => {
  const cases = [
    { ...MACE, id: '110730049' },
    { ...MACE, rarity: 'gold' },
    { ...MACE, icon: 'https://assets.playnccdn.com.attacker.example/a.png' },
    { ...MACE, icon: 'http://assets.playnccdn.com/static-aion2-gamedata/resources/a.png' },
    { ...MACE, icon: 'https://assets.playnccdn.com/other/a.png' },
    { ...MACE, name: '' },
    { ...MACE, name: 'Bad\u0007Name' },
    { ...MACE, itemLevel: '45' },
    { ...MACE, sellPrice: -1 },
    { ...MACE, stats: [{ label: 'Attack', value: 160 }] },
    { ...MACE, stats: [{ label: 'Attack', value: '1', extra: true }] },
    { ...MACE, randomStats: { picks: 3 } },
    { ...MACE, script: '<script>' },
  ];
  for (const raw of cases) assert.throws(() => validateItem(raw, '110730048'), undefined, JSON.stringify(raw).slice(0, 80));
});

test('rarity classes match the character-sheet gear classes', () => {
  assert.deepEqual(RARITIES, ['common', 'rare', 'legend', 'unique', 'epic', 'mythic', 'special']);
});
