import { itemId, shardPath, findItem, questlogUrl } from './item-data.js';

const $ = id => document.getElementById(id);
const el = (tag, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
const fmt = value => value.toLocaleString('en-US');
const id = itemId(new URLSearchParams(location.search).get('id') ?? '');

function show(message, retry = false) {
  $('item-message').textContent = message;
  $('retry').hidden = !retry;
  $('item-status').hidden = false;
  $('item-card').hidden = true;
}
function fill(listId, rows, sectionId = listId) {
  $(listId).replaceChildren(...rows.map(row => {
    const pair = el('div');
    pair.append(el('dt', row.label), el('dd', row.value));
    return pair;
  }));
  $(sectionId).hidden = rows.length === 0;
}
function render(item) {
  document.title = item.name + ' · Exalted';
  $('item-card').className = 'panel item-card ' + item.rarity;
  $('item-name').textContent = item.name;
  $('item-meta').textContent = item.grade + ' · ' + item.type;
  $('item-initial').textContent = item.name[0];
  const icon = $('item-icon');
  icon.hidden = true;
  if (item.icon) {
    icon.onload = () => { icon.hidden = false; $('item-initial').hidden = true; };
    icon.onerror = () => { icon.hidden = true; $('item-initial').hidden = false; };
    icon.src = item.icon;
  }
  fill('item-facts', [
    item.itemLevel != null && { label: 'Item level', value: fmt(item.itemLevel) },
    item.requiredLevel != null && { label: 'Required level', value: fmt(item.requiredLevel) },
    item.sellPrice != null && { label: 'Sell price', value: fmt(item.sellPrice) + ' Kina' },
  ].filter(Boolean));
  fill('base-stat-list', item.stats ?? [], 'base-stats');
  fill('random-stat-list', item.randomStats?.stats ?? [], 'random-stats');
  if (item.randomStats) $('random-stats-note').textContent = 'Each copy rolls ' + item.randomStats.picks + ' of these.';
  $('item-status').hidden = true;
  $('item-card').hidden = false;
}
async function load() {
  if (!id) return show("Choose an item from Discord's /item command or a character sheet.");
  show('Loading item…');
  try {
    const response = await fetch(shardPath(id));
    if (!response.ok) throw new Error('Snapshot unavailable');
    const item = findItem(await response.json(), id);
    if (!item) return show("This item isn't in the Exalted list yet. Try View on questlog.gg above.");
    render(item);
  } catch {
    show('Item details are unavailable right now.', true);
  }
}

if (id) {
  for (const link of [$('questlog-link'), $('full-details')]) link.href = questlogUrl(id);
  $('questlog-link').hidden = false;
}
$('retry').addEventListener('click', load);
load();
