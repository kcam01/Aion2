// Validates the published item snapshot for the /item page, the gear popup and tests.
export const RARITIES = Object.freeze(['common', 'rare', 'legend', 'unique', 'epic', 'mythic', 'special']);
const FIELDS = new Set(['id', 'name', 'grade', 'rarity', 'type', 'category', 'icon', 'itemLevel', 'requiredLevel', 'stats', 'randomStats', 'sellPrice']);
const ICON_PATH = '/static-aion2-gamedata/resources/';

export const itemId = value => typeof value === 'string' && /^\d{1,12}$/.test(value) ? value : null;
export const shardPath = id => '/items/' + id.slice(-2).padStart(2, '0') + '.json';
export const questlogUrl = id => 'https://questlog.gg/aion-2/en/db/item/' + id;
export const itemPageUrl = id => '/item?id=' + id;

function fail(message) { throw new TypeError(message); }
function text(value, limit) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000-\u001f\u007f]/.test(value)) fail('Invalid item text');
  return value;
}
function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail('Invalid item number');
  return value;
}
function icon(value) {
  let url;
  try { url = new URL(text(value, 300)); } catch { fail('Invalid item icon'); }
  if (url.protocol !== 'https:' || url.hostname !== 'assets.playnccdn.com' || url.username || url.password || url.port
      || !url.pathname.startsWith(ICON_PATH) || url.search || url.hash) fail('Invalid item icon');
  return url.href;
}
function stats(value) {
  if (!Array.isArray(value) || !value.length || value.length > 60) fail('Invalid item stats');
  return Object.freeze(value.map(stat => {
    if (!stat || typeof stat !== 'object' || Object.keys(stat).length !== 2) fail('Invalid item stat');
    return Object.freeze({ label: text(stat.label, 80), value: text(stat.value, 80) });
  }));
}

export function validateItem(raw, id) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Invalid item');
  if (Object.keys(raw).some(key => !FIELDS.has(key))) fail('Unexpected item field');
  if (raw.id !== id || !itemId(id)) fail('Item ID mismatch');
  if (!RARITIES.includes(raw.rarity)) fail('Invalid item rarity');
  const item = { id, name: text(raw.name, 200), grade: text(raw.grade, 40), rarity: raw.rarity,
                 type: text(raw.type, 80), category: text(raw.category, 80) };
  if ('icon' in raw) item.icon = icon(raw.icon);
  for (const key of ['itemLevel', 'requiredLevel', 'sellPrice']) if (key in raw) item[key] = count(raw[key]);
  if ('stats' in raw) item.stats = stats(raw.stats);
  if ('randomStats' in raw) {
    const random = raw.randomStats;
    if (!random || typeof random !== 'object' || Object.keys(random).length !== 2) fail('Invalid random stats');
    item.randomStats = Object.freeze({ picks: count(random.picks), stats: stats(random.stats) });
  }
  return Object.freeze(item);
}

export function findItem(shard, id) {
  if (!shard || typeof shard !== 'object' || shard.version !== 1 || !shard.items
      || typeof shard.items !== 'object' || Array.isArray(shard.items)) fail('Invalid item snapshot');
  return Object.hasOwn(shard.items, id) ? validateItem(shard.items[id], id) : null;
}
