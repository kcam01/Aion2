import { validateRoster } from './member-roster.js';
import { DIRECTORY_SORTS, createDirectoryRows, normalizeDirectoryProfile, selectDirectoryRows } from './member-directory-data.js';

const byId = id => document.getElementById(id);
const body = byId('roster-rows');
const search = byId('roster-search'), classFilter = byId('roster-class'), includeAlts = byId('roster-alts');
const sortControl = byId('roster-sort'), refreshButton = byId('roster-refresh');
const count = byId('roster-count'), freshness = byId('roster-freshness'), error = byId('roster-error');
const colors = { Cleric: '#e0ce83', Chanter: '#cbb488', Spiritmaster: '#d58ae1', Sorcerer: '#9fa7ef', Gladiator: '#80d5db', Templar: '#9dcaf0', Assassin: '#d4a2ae', Ranger: '#97c6a0' };
const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
let rows = [], mainCount = 0, sort = 'level', direction = 'desc', loading = false;
const elements = new Map();
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function setText(element, text) { if (element.textContent !== text) element.textContent = text; }
function characterLink(slug) { return '/member?name=' + encodeURIComponent(slug); }

function createRow(row) {
  const tr = node('tr');
  tr.dataset.member = row.slug;
  const identity = node('td');
  const character = node('div', 'roster-character');
  const portrait = node('span', 'roster-portrait', Array.from(row.name)[0]);
  portrait.setAttribute('aria-hidden', 'true');
  if (row.portrait) {
    const img = node('img'); img.alt = ''; img.width = 40; img.height = 46; img.loading = 'lazy';
    img.addEventListener('error', () => img.remove(), { once: true }); img.src = row.portrait; portrait.append(img);
  }
  const details = node('div');
  const name = node('a', 'roster-character-name', row.name); name.href = characterLink(row.slug);
  const subtitle = node('span', 'roster-character-sub');
  if (row.mainSlug) { subtitle.append('Alt of '); const main = node('a', '', row.mainName); main.href = characterLink(row.mainSlug); subtitle.append(main); }
  details.append(name, subtitle); character.append(portrait, details); identity.append(character);
  const classCell = node('td'); const className = node('span', 'roster-class', row.className);
  className.style.setProperty('--class-color', colors[row.className] || '#cbd6d3'); classCell.append(className);
  const fields = {};
  for (const key of ['level', 'itemLevel', 'combatPower']) { fields[key] = node('td', 'roster-number' + (key === 'itemLevel' ? ' roster-item-level' : ''), '—'); fields[key].dataset.field = key; }
  const server = node('td', 'roster-server', row.serverName);
  const state = node('td', 'roster-profile-state'); const status = node('span'); const updated = node('small'); state.append(status, updated);
  tr.append(identity, classCell, ...Object.values(fields), server, state);
  return { tr, subtitle, fields, state, status, updated };
}
function updateRow(row, element) {
  for (const key of ['level', 'itemLevel', 'combatPower']) {
    setText(element.fields[key], row[key] == null ? '—' : numberFormat.format(row[key]));
    element.fields[key].dataset.missing = String(row[key] == null);
  }
  if (!row.mainSlug) setText(element.subtitle, row.title);
  element.state.dataset.state = row.status;
  setText(element.status, ({ loading: 'Loading…', ready: 'Profile loaded', stale: 'Refresh failed', unavailable: 'Unavailable' })[row.status]);
  const checked = row.checkedAt ? new Date(row.checkedAt) : null;
  setText(element.updated, checked ? checked.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
  element.state.title = checked ? `Last successful check: ${checked.toLocaleString()}. Public profile may be cached.` : 'Profile stats have not loaded. This is not an online indicator.';
}
function render() {
  const selected = selectDirectoryRows(rows, { query: search.value, className: classFilter.value, includeAlts: includeAlts.checked, sort, direction });
  const active = document.activeElement;
  const restoreFocus = body.contains(active);
  const visible = new Set(selected.map(row => row.slug));
  for (const [slug, element] of elements) element.tr.hidden = !visible.has(slug);
  for (const row of selected) {
    if (!elements.has(row.slug)) elements.set(row.slug, createRow(row));
    const element = elements.get(row.slug); element.tr.hidden = false; updateRow(row, element); body.append(element.tr);
  }
  if (restoreFocus && active.isConnected && !active.closest('tr').hidden) active.focus({ preventScroll: true });
  const eligible = includeAlts.checked ? rows.length : mainCount;
  setText(count, `${selected.length} of ${eligible} ${includeAlts.checked ? 'characters' : 'members'} · ${DIRECTORY_SORTS[sort]}, ${direction === 'desc' ? 'descending' : 'ascending'}`);
  byId('roster-empty').hidden = selected.length > 0 || loading || !rows.length;
  for (const th of document.querySelectorAll('[data-sort-column]')) {
    const selected = th.dataset.sortColumn === sort;
    th.setAttribute('aria-sort', selected ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
    th.querySelector('span').textContent = selected ? (direction === 'asc' ? '▲' : '▼') : '↕';
  }
  sortControl.value = `${sort}:${direction}`;
}
function reportProgress() {
  const completed = rows.filter(row => row.status !== 'loading').length;
  const failed = rows.filter(row => ['unavailable', 'stale'].includes(row.status)).length;
  const loaded = rows.filter(row => row.checkedAt).length;
  freshness.textContent = loading ? `Loading character stats · ${completed} of ${rows.length} checked…` :
    `${loaded} of ${rows.length} character profiles have stats.${failed ? ` ${failed} could not refresh; earlier values remain where available.` : ''} Checked ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
}
async function refresh() {
  if (loading) return;
  let rosterFailed = false;
  loading = true; refreshButton.disabled = true; error.hidden = true;
  freshness.textContent = 'Checking the approved roster…';
  try {
    const response = await fetch('/members.json', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Roster unavailable');
    const members = validateRoster(await response.json());
    const previous = new Map(rows.map(row => [row.slug, row]));
    rows = createDirectoryRows(members).map(row => {
      const old = previous.get(row.slug);
      return old?.profileId === row.profileId && old.serverId === row.serverId ? { ...row, level: old.level, itemLevel: old.itemLevel, combatPower: old.combatPower, title: old.title, checkedAt: old.checkedAt } : row;
    });
    mainCount = members.length;
    byId('roster-total').textContent = mainCount;
    byId('roster-alt-count').textContent = `(${rows.length - mainCount})`;
    const selectedClass = classFilter.value;
    classFilter.replaceChildren(new Option('All classes', 'all'), ...[...new Set(rows.map(row => row.className))].sort().map(name => new Option(name, name)));
    classFilter.value = [...classFilter.options].some(option => option.value === selectedClass) ? selectedClass : 'all';
    elements.clear(); body.replaceChildren(); render();
    if (!rows.length) {
      error.hidden = false; error.textContent = 'No approved characters are linked yet. Follow START HERE in Discord to join the roster.';
    }
    let cursor = 0;
    async function worker() {
      while (cursor < rows.length) {
        const row = rows[cursor++];
        try {
          const response = await fetch(`/api/aion2?type=info&member=${encodeURIComponent(row.slug)}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
          if (!response.ok) throw Error('Profile unavailable');
          Object.assign(row, normalizeDirectoryProfile(await response.json(), row), { status: 'ready', checkedAt: Date.now() });
        } catch { row.status = row.checkedAt ? 'stale' : 'unavailable'; }
        render(); reportProgress();
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker));
  } catch {
    rosterFailed = true;
    error.hidden = false;
    error.textContent = rows.length ? 'The roster could not refresh. The previously loaded roster is still shown. Try Refresh stats again.' : 'The guild roster could not load. Try Refresh stats again.';
  } finally {
    loading = false; refreshButton.disabled = false; render();
    if (rosterFailed) freshness.textContent = 'Roster refresh failed. Any previously loaded stats remain visible.';
    else if (rows.length) reportProgress();
    else freshness.textContent = 'No character stats loaded.';
  }
}
for (const button of document.querySelectorAll('[data-sort]')) button.addEventListener('click', () => {
  const key = button.dataset.sort;
  direction = sort === key ? (direction === 'asc' ? 'desc' : 'asc') : ['level', 'itemLevel', 'combatPower'].includes(key) ? 'desc' : 'asc';
  sort = key; render();
});
sortControl.addEventListener('change', () => { [sort, direction] = sortControl.value.split(':'); render(); });
search.addEventListener('input', render);
classFilter.addEventListener('change', render);
includeAlts.addEventListener('change', render);
byId('roster-clear').addEventListener('click', () => { search.value = ''; classFilter.value = 'all'; render(); search.focus(); });
refreshButton.addEventListener('click', refresh);
refresh();
