import { getMember, characters, getCharacterFamily, officialProfile } from './members.js';
import { renderCharacterFamily } from './character-family.js';
import { buildSheet, formatNumber as fmt, appendHistory, parseHistory } from './character-sheet.js';

const $ = id => document.getElementById(id);
const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};
const empty = (id, message) => $(id).replaceChildren(el('p', 'empty-state', message));
const member = getMember(new URLSearchParams(location.search).get('name') ?? undefined);
const tabs = ['overview', 'daevanion', 'skills', 'titles', 'history'];
const storageKey = member ? 'exalted:character-history:v1:' + member.region + ':' + member.serverId + ':' + member.profileId : '';
let info = null, equipment = null, sheet = buildSheet(null, null, member), skillFilter = 'All', history = [], loading = false, comparisonRequest = 0, lastChecked = 0;
let historyAvailable = true;
try { history = parseHistory(localStorage.getItem(storageKey)); } catch { historyAvailable = false; }

function picture(src, name, size = 46) {
  const image = el('img');
  image.src = src; image.alt = name; image.width = size; image.height = size; image.loading = 'lazy';
  image.addEventListener('error', () => { image.hidden = true; }, { once: true });
  return image;
}
function artwork(item) {
  const frame = el('span', 'item-art');
  if (item.icon) frame.append(picture(item.icon, '', 46));
  if (item.enchant > 0) frame.append(el('span', 'enchant', '+' + item.enchant));
  return frame;
}
function metadata(item) {
  return [item.slot, item.grade, item.level != null ? 'Lv ' + item.level : ''].filter(Boolean).join(' · ');
}
function renderHeader() {
  document.title = sheet.name + ' · Exalted';
  $('character-name').textContent = sheet.name;
  $('portrait-fallback').textContent = sheet.name[0];
  $('faction').textContent = sheet.faction;
  $('server').textContent = sheet.server + ' · NA East';
  $('character-title').textContent = sheet.title;
  $('character-title').hidden = !sheet.title;
  $('class').textContent = sheet.className;
  $('level').textContent = fmt(sheet.level);
  $('cp').textContent = fmt(sheet.combatPower);
  $('item-level').textContent = fmt(sheet.itemLevel);
  $('power-note').textContent = sheet.className + (sheet.level != null ? ' · Level ' + sheet.level : '');
  for (const id of ['portrait', 'backdrop-portrait']) {
    const image = $(id);
    if (!sheet.portrait) { image.hidden = true; continue; }
    image.onerror = () => { image.hidden = true; };
    image.src = sheet.portrait;
    image.hidden = false;
  }
  $('portrait').alt = sheet.name + ' character portrait';
}
function renderEquipment() {
  $('gear').setAttribute('aria-busy', 'false');
  if (!sheet.equipment.length) return empty('gear', equipment ? 'No equipped items were returned by PLAYNC.' : 'Equipment is unavailable. Try Refresh.');
  $('gear').replaceChildren(...sheet.equipment.map(item => {
    const button = el('button', 'equipment-card ' + item.rarity);
    button.type = 'button';
    button.title = item.name + '\n' + metadata(item) + (item.enchant > 0 ? '\nEnchantment +' + item.enchant : '') + '\nClick for details';
    const copy = el('span', 'item-copy');
    copy.append(el('strong', '', item.name), el('small', '', metadata(item)));
    button.append(artwork(item), copy);
    button.addEventListener('click', () => inspectItem(item));
    return button;
  }));
}
function inspectItem(item) {
  $('item-dialog-title').textContent = item.name;
  const summary = el('div', 'inspect-item ' + item.rarity), copy = el('div');
  copy.append(el('strong', '', item.grade || item.slot), el('p', '', metadata(item)));
  summary.append(artwork(item), copy);
  const stats = el('dl', 'inspect-stats');
  for (const [label, value] of [['Enchantment', item.enchant], ['Exceed level', item.exceed], ['Level', item.level]]) {
    if (value == null) continue;
    const row = el('div');
    row.append(el('dt', '', label), el('dd', '', (label === 'Enchantment' ? '+' : '') + value));
    stats.append(row);
  }
  $('item-details').replaceChildren(summary, stats, el('p', 'data-note', 'Equipped item details shared by PLAYNC. Additional item effects are not included in the public character summary.'));
  $('item-dialog').showModal();
}
const statPaths = {
  STR: 'M8 20v-5L5 11l2-3 3 2V5h3v4-5h3v5-4h3v7l-3 4v4M8 15h8',
  DEX: 'M5 21 19 3 17 12 10 15M8 18 6 11 13 7M11 14l1-8',
  INT: 'M3 6c4-2 6-1 9 1 3-2 5-3 9-1v14c-4-2-6-1-9 1-3-2-5-3-9-1ZM12 7v14M7 3v7m10-7v7',
  CON: 'M12 21 3 12C-2 4 8 1 12 7 16 1 26 4 21 12ZM12 3v3',
  AGI: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  WIS: 'm12 2 2 7 7-3-5 6 6 3-8 1-2 6-2-6-8-1 6-3-5-6 7 3Z',
};
function statIcon(type) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  path.setAttribute('d', statPaths[type]); svg.append(path); return svg;
}
function renderStats() {
  $('stats').replaceChildren(...sheet.primary.map(stat => {
    const card = el('div', 'attribute' + (stat.value === 0 ? ' zero' : ''));
    card.title = stat.effects.join('\n') || stat.name;
    card.append(statIcon(stat.type), el('span', '', stat.name), el('strong', '', fmt(stat.value)));
    return card;
  }));
  if (!sheet.divine.length) return empty('divine-stats', info ? 'No divine attributes were returned.' : 'Attributes are unavailable. Try Refresh.');
  const highest = Math.max(1, ...sheet.divine.map(x => x.value || 0));
  const marks = ['♜', '✥', '✧', '♧', '◷', '✷', '♜', '✦', '◇', '✧'];
  $('divine-stats').replaceChildren(...sheet.divine.map((stat, index) => {
    const row = el('div', 'divine-row'), icon = el('span', 'divine-icon', marks[index % marks.length]);
    icon.setAttribute('aria-hidden', 'true');
    const copy = el('div', 'divine-copy'), name = el('strong', '', stat.name);
    if (stat.deity) name.append(el('span', '', ' · ' + stat.deity));
    copy.append(name, el('small', '', stat.effects[0] || 'No effect details'));
    row.title = stat.effects.join('\n');
    const meter = el('span', 'divine-meter'), fill = el('span');
    // A relative visual comparison, not a claimed maximum or upgrade cap.
    meter.setAttribute('aria-hidden', 'true');
    fill.style.width = Math.max(0, (stat.value || 0) / highest * 100) + '%';
    meter.append(fill);
    row.append(icon, copy, meter, el('span', 'divine-value', fmt(stat.value)));
    return row;
  }));
}
function boardRow(board) {
  const row = el('div', 'board-row'), label = el('div', 'board-label');
  label.append(el('strong', '', board.name), el('span', '', fmt(board.opened) + ' / ' + fmt(board.total) + ' · ' + (board.percent == null ? '—' : board.percent + '%')));
  row.append(label);
  if (board.percent != null) {
    const meter = el('progress');
    meter.max = 100; meter.value = board.percent; meter.setAttribute('aria-label', board.name + ' board completion');
    row.append(meter);
  }
  return row;
}
function renderBoards() {
  if (!sheet.boards.length) {
    empty('boards', info ? 'No board progress was returned by PLAYNC.' : 'Daevanion is unavailable. Try Refresh.');
    empty('board-preview', info ? 'No board progress was returned.' : 'Daevanion is unavailable. Try Refresh.');
    return;
  }
  $('board-preview').replaceChildren(...sheet.boards.map(boardRow));
  const known = sheet.boards.every(x => x.opened != null && x.total != null);
  $('board-summary').textContent = known ? fmt(sheet.boards.reduce((n,x) => n+x.opened, 0)) + ' / ' + fmt(sheet.boards.reduce((n,x) => n+x.total, 0)) + ' nodes' : 'Board progress';
  $('boards').replaceChildren(...sheet.boards.map(board => {
    const detail = el('div', 'board-detail');
    detail.append(boardRow(board), el('small', 'board-state', board.unlocked ? 'Board unlocked' : 'Board not unlocked'));
    return detail;
  }));
}
function skillRow(skill, detailed = false) {
  const row = el('div', 'skill-row' + (!skill.acquired ? ' locked' : ''));
  row.append(skill.icon ? picture(skill.icon, '', 38) : el('span', 'skill-icon'));
  const copy = el('div', 'skill-copy'), name = el('strong', '', skill.name);
  if (detailed && skill.equipped) name.append(el('span', 'equipped-label', 'Equipped'));
  copy.append(name);
  if (detailed) copy.append(el('small', '', skill.category + (skill.requiredLevel != null ? ' · Requires level ' + skill.requiredLevel : '')));
  row.append(copy, el('span', 'skill-level', skill.acquired ? 'Lv ' + fmt(skill.level) : 'Locked'));
  return row;
}
function renderSkills() {
  $('skill-count').textContent = sheet.skills.length ? sheet.skills.filter(x => x.acquired).length + ' / ' + sheet.skills.length + ' acquired' : '—';
  if (!sheet.skillPreview.length) empty('skill-preview', equipment ? 'No acquired skills were returned.' : 'Skills are unavailable. Try Refresh.');
  else $('skill-preview').replaceChildren(...sheet.skillPreview.map(x => skillRow(x)));
  const selected = sheet.skills.filter(x => skillFilter === 'All' || x.category === skillFilter);
  if (!selected.length) empty('skills', equipment ? 'No skills in this category.' : 'Skills are unavailable. Try Refresh.');
  else $('skills').replaceChildren(...selected.map(x => skillRow(x, true)));
}
function collection(owned, total) { return owned == null ? 'Collection count unavailable' : fmt(owned) + (total == null ? '' : ' / ' + fmt(total)) + ' collected'; }
function renderTitles() {
  $('title-summary').textContent = collection(sheet.titlesOwned, sheet.titlesTotal);
  $('displayed-title').textContent = sheet.title || 'No displayed title';
  $('displayed-title-grade').textContent = sheet.titleGrade;
  $('displayed-title-grade').hidden = !sheet.titleGrade;
  if (!sheet.titles.length) { $('title-list').replaceChildren(el('li', 'empty-state', info ? 'No equipped title details were returned by PLAYNC.' : 'Titles are unavailable. Try Refresh.')); return; }
  $('title-list').replaceChildren(...sheet.titles.map(title => {
    const card = el('li', 'title-card'), top = el('div', 'title-card-top');
    top.append(el('span', '', title.equipCategory === 'Etc' ? 'Other' : title.equipCategory), el('span', '', title.grade || ''));
    card.append(top, el('h3', 'title-name', title.name || 'No title equipped'), el('p', 'title-slot-status', 'Equipped title'));
    const effects = el('dl', 'title-effects');
    for (const [label, values] of [['Equipped effect', title.equipStatList], ['Title effect', title.statList]]) {
      if (!Array.isArray(values) || !values.length) continue;
      effects.append(el('dt', '', label));
      for (const value of values) if (typeof value.desc === 'string') effects.append(el('dd', '', value.desc));
    }
    card.append(effects, el('p', 'title-category-count', collection(title.ownedCount, title.totalCount)));
    return card;
  }));
}
function table(headers, className) {
  const scroll = el('div', 'table-scroll'), table = el('table', className), head = el('thead'), row = el('tr'), body = el('tbody');
  for (const title of headers) { const th = el('th', '', title); th.scope = 'col'; row.append(th); }
  head.append(row); table.append(head, body); scroll.append(table);
  return { scroll, body };
}
function renderHistory() {
  if (!historyAvailable) $('history-note').textContent = 'Browser storage is unavailable. Snapshots will last only for this page visit.';
  if (!history.length) return empty('history', 'Your first snapshot will appear after a complete character load.');
  const { scroll, body } = table(['Observed', 'Level', 'Combat power', 'Item level'], 'history-table');
  for (const entry of history) {
    const row = el('tr'), cell = el('td'), time = el('time', '', new Date(entry.checkedAt).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }));
    time.dateTime = entry.checkedAt; time.title = new Date(entry.checkedAt).toLocaleString(); cell.append(time);
    row.append(cell, ...['level', 'combatPower', 'itemLevel'].map(key => el('td', '', fmt(entry[key])))); body.append(row);
  }
  $('history').replaceChildren(scroll);
}
function render() {
  sheet = buildSheet(info, equipment, member);
  renderHeader(); renderEquipment(); renderStats(); renderBoards(); renderSkills(); renderTitles(); renderHistory();
}
async function get(type, selectedMember = member) {
  const response = await fetch('/api/aion2?' + new URLSearchParams({ type, member: selectedMember.slug }), { cache:'no-store', signal:AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('PLAYNC request failed (' + response.status + ')');
  const result = await response.json();
  if (result.ok === false) throw new Error('PLAYNC data unavailable');
  const data = result.data || result;
  if (type === 'info' && !data.profile?.characterName) throw new Error('PLAYNC profile unavailable');
  return result;
}
async function load() {
  if (loading || !member) return;
  loading = true;
  $('refresh').disabled = true; $('refresh').setAttribute('aria-busy', 'true');
  $('refresh').querySelector('span').textContent = 'Refreshing';
  $('status').textContent = 'Checking PLAYNC…';
  const results = await Promise.allSettled([get('info'), get('equipment')]);
  const failed = results.map((x,i) => x.status === 'rejected' ? (i === 0 ? 'profile and attributes' : 'equipment and skills') : '').filter(Boolean);
  const hadPreviousData = Boolean(info || equipment);
  if (results[0].status === 'fulfilled') info = results[0].value;
  if (results[1].status === 'fulfilled') equipment = results[1].value;
  render();
  $('data-message').hidden = !failed.length;
  if (failed.length) {
    $('data-message').textContent = 'Could not refresh ' + failed.join(' or ') + '.' + (hadPreviousData ? ' Previously loaded values remain visible.' : '') + ' Try Refresh again.';
    $('status').textContent = 'Some data unavailable';
    lastChecked = 0;
  } else {
    const checkedAt = new Date().toISOString();
    lastChecked = Date.now();
    $('status').textContent = 'Checked just now';
    $('status').title = 'Checked ' + new Date(checkedAt).toLocaleString() + '. PLAYNC profiles may be cached.';
    history = appendHistory(history, sheet, checkedAt);
    try { localStorage.setItem(storageKey, JSON.stringify(history)); } catch { historyAvailable = false; }
    renderHistory();
  }
  $('refresh').disabled = false; $('refresh').setAttribute('aria-busy', 'false'); $('refresh').querySelector('span').textContent = 'Refresh';
  $('compare').disabled = !info || characters.length < 2;
  loading = false;
}
function selectTab(name, focus = false, updateHash = true) {
  if (!tabs.includes(name)) name = 'overview';
  for (const tab of tabs) {
    const selected = tab === name;
    $('tab-' + tab).setAttribute('aria-selected', String(selected));
    $('tab-' + tab).tabIndex = selected ? 0 : -1;
    $('panel-' + tab).hidden = !selected;
  }
  if (focus) $('tab-' + name).focus();
  if (updateHash) window.history.replaceState(null, '', location.pathname + location.search + (name === 'overview' ? '' : '#' + name));
}
function hashTab() { selectTab(location.hash === '#character-titles' ? 'titles' : location.hash.slice(1), false, false); }
document.querySelectorAll('[data-tab]').forEach(button => {
  button.addEventListener('click', () => selectTab(button.dataset.tab));
  button.addEventListener('keydown', event => {
    const index = tabs.indexOf(button.dataset.tab);
    const target = { ArrowRight:(index + 1) % tabs.length, ArrowLeft:(index + tabs.length - 1) % tabs.length, Home:0, End:tabs.length - 1 }[event.key];
    if (target != null) { event.preventDefault(); selectTab(tabs[target], true); }
  });
});
document.querySelectorAll('[data-open-tab]').forEach(button => button.addEventListener('click', () => {
  selectTab(button.dataset.openTab, true);
  $('sheet').scrollIntoView({ block:'start', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}));
document.querySelectorAll('[data-skill-filter]').forEach(button => button.addEventListener('click', () => {
  skillFilter = button.dataset.skillFilter;
  document.querySelectorAll('[data-skill-filter]').forEach(x => x.setAttribute('aria-pressed', String(x === button)));
  renderSkills();
}));
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
});
async function compare() {
  const selected = getMember($('compare-member').value), request = ++comparisonRequest;
  if (!selected) return;
  empty('comparison', 'Loading ' + selected.name + '…');
  try {
    const other = buildSheet(await get('info', selected), null, selected);
    if (request !== comparisonRequest) return;
    const { scroll, body } = table(['Attribute', sheet.name, other.name], 'comparison-table');
    const rows = [['Class', sheet.className, other.className], ['Server', sheet.server, other.server], ['Level', sheet.level, other.level], ['Combat power', sheet.combatPower, other.combatPower], ['Item level', sheet.itemLevel, other.itemLevel], ...sheet.primary.map((stat, index) => [stat.name, stat.value, other.primary[index].value])];
    for (const [label, current, value] of rows) {
      const row = el('tr'), cell = el('td', '', typeof value === 'string' ? value : fmt(value));
      if (typeof current === 'number' && typeof value === 'number') {
        const difference = value - current;
        cell.append(el('small', 'difference' + (difference > 0 ? ' positive' : ''), difference ? (difference > 0 ? '+' : '') + fmt(difference) : 'Same'));
      }
      row.append(el('th', '', label), el('td', '', typeof current === 'string' ? current : fmt(current)), cell); body.append(row);
    }
    const link = el('a', 'comparison-link', 'Open ' + other.name + "'s character sheet →");
    link.href = '/member?name=' + encodeURIComponent(selected.slug);
    $('comparison').replaceChildren(scroll, link);
  } catch {
    if (request === comparisonRequest) empty('comparison', 'Could not load this member. Choose a member again to retry.');
  }
}
$('refresh').addEventListener('click', load);
$('compare').addEventListener('click', () => { $('compare-dialog').showModal(); compare(); });
$('compare-member').addEventListener('change', compare);
addEventListener('hashchange', hashTab);
setInterval(() => {
  if (!lastChecked || loading) return;
  const minutes = Math.floor((Date.now() - lastChecked) / 60000);
  $('status').textContent = minutes < 1 ? 'Checked just now' : 'Checked ' + minutes + ' min ago';
}, 60000);
hashTab();
if (member) {
  renderCharacterFamily($('character-family'), getCharacterFamily(member.slug), member.slug);
  renderHeader();
  $('official-profile').href = officialProfile(member); $('official-profile').hidden = false;
  const others = characters.filter(x => x.slug !== member.slug);
  $('compare-member').replaceChildren(...others.map(x => { const option = el('option', '', x.name + ' · ' + x.className); option.value = x.slug; return option; }));
  if (!others.length) $('compare').title = 'Comparison is available when another guild member is linked.';
  load();
} else {
  render();
  $('character-name').textContent = 'Member not found';
  document.title = 'Member not found · Exalted';
  $('status').textContent = 'Choose a member from the guild roster.';
  $('data-message').hidden = false;
  $('data-message').textContent = 'This character is not in the approved guild roster. Return to the guild roster to choose a member.';
  document.querySelector('.sheet-toolbar').hidden = true;
  document.querySelector('.headline-stats').hidden = true;
  document.querySelector('.badges').hidden = true;
  $('class').hidden = true;
  $('level').parentElement.hidden = true;
  for (const tab of tabs) $('panel-' + tab).hidden = true;
}
