# Discord Item Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members type `/item` in Discord, autocomplete an AION 2 item, and post a card linking to a new Exalted page at `/item?id=<id>`. The data comes from a daily questlog.gg snapshot that the bot host publishes into the website repository.

**Architecture:** A daily systemd job on the bot host does four things. It crawls questlog's item list (split by category and grade to get past its 1,000-result cap) and refreshes details for new items plus a rotating seventh. It writes 100 deterministic shard files (`items/00.json` … `items/99.json`) and pushes them to `main` only when they change. It then atomically replaces a small SQLite index that the bot's `/item` autocomplete reads. The static website page loads one shard and renders the item. Character-sheet gear popups link to the same page using PLAYNC item IDs, which match questlog's.

**Tech Stack:** Python 3.10 on the bot host (discord.py 2.7.1, standard-library `urllib` and `sqlite3`, `unittest`). Static HTML/CSS/ES modules on Vercel, tested with `node --test` on Node 24. Git plumbing for publishing.

**Spec:** `docs/superpowers/specs/2026-10-11-item-links-design.md`

---

## Facts verified on 2026-10-11 (do not re-derive; re-check only where a step says so)

- **List endpoint:** `GET https://questlog.gg/aion-2/api/trpc/database.getItems?input=<url-encoded JSON>`. No auth.
  - Input: `{"language":"en","page":N,"mainCategory"?:str,"subCategory"?:str,"facets"?:{"grade":<int>}}`.
  - Response: `result.data = {pageData:[...40 rows], pageCount, currentPage, facetDistribution:{grade:{"11":n,...}, createdAt:{...}}}`.
  - **Any single query returns at most 1,000 rows** (pages past 25 are empty), even though `pageCount` reports more.
  - `facets.grade` filters rows. `facetDistribution.grade` always reports counts for every grade under the other filters, so for a grade-filtered query, the count for that grade is `facetDistribution.grade[str(grade)]`.
  - Unfiltered total on 2026-10-11: 9,260 (`pageCount` 232).
  - The grade, category and subcategory partitions in Task 6 reach 9,252 items. 8 usable items have no subcategory in questlog's label list, so they cannot be reached; the job tolerates a shortfall of up to 1% and records it.
- **Detail endpoint:** `GET .../database.getItem?input={"language":"en","id":"<id>"}`.
  - Fields used: `id, name, icon, grade, mainCategory, subCategory, isSellable, sellPrice, minLevelRequirement, equipmentInfo.itemLevel, equipmentInfo.soulbindRandomStatCount, itemStats.mainStats{id:value}, itemStats.subStats[{id,minValue,maxValue}]`.
- **Icons:** questlog `icon` looks like `/assets/Game/UI/Resource/Texture/Item/Weapon/Icon_WP_GS_0108_T06.Icon_WP_GS_0108_T06`. The final segment exists at `https://assets.playnccdn.com/static-aion2-gamedata/resources/<name>.png`.
- **Grade codes → PLAYNC names**, confirmed from roster gear: `11` Common, `21` Rare, `31` Legend, `41` Unique, `71` Special. Code `51` (188 items) is not seen in PLAYNC data, so it uses questlog's label "Mythic" and is logged. questlog's own labels differ (31 "Epic", 41 "Legend").
- **IDs:** PLAYNC equipment `id` values (numbers, e.g. `110730048`) are questlog item IDs.
- **Bot host:** `ssh oldcg` (`kcam@192.168.100.54`), app `/home/kcam/bots/exalted`, Python 3.10.12, passwordless sudo.
  - The local copy `D:\website\aion\output\exalted-bot` matched the deployed source hashes on 2026-10-11.
  - The bot copy is **not** a git repository. Bot tasks end with a test run instead of a commit; the deploy task records hashes.
- **Website repo:** `D:\website\aion`, branch `claude/item-links` (created from `origin/main`, no upstream). Git identity is not configured globally; commit with `git -c user.name=kcam01 -c user.email=17442074+kcam01@users.noreply.github.com commit ...`.

## File structure

Website (`D:\website\aion`):
- Create `item-data.js`: pure validation and URL helpers for snapshot records, shared by the page and tests.
- Create `item.html`, `item.css`, `item.js`: the `/item?id=` page.
- Modify `character-sheet.js`: keep the gear `id`.
- Modify `app.js`: "View item" link in the gear popup.
- Create `tests/item-data.test.mjs`. Modify `tests/character-sheet.test.mjs`.
- Modify `README.md`. Create `docs/items-maintenance.md`.
- `items/*.json` are written **only** by the bot host job, never committed from this branch.

Bot (`D:\website\aion\output\exalted-bot`):
- Create `exalted/item_labels.py`: static tables (grades, categories, types, stats with format and order).
- Create `exalted/item_catalog.py`: questlog client, partitioned crawl, detail subset, trimming/formatting, shards, record validation.
- Create `exalted/item_sync.py`: details cache, rotating refresh, guards, git publishing, index writer, CLI/health.
- Create `exalted/items_discord.py`: `ItemIndex` reader, autocomplete ranking, value resolution, embed, `/item` registration.
- Modify `exalted/bot.py` (wiring, help), `exalted/verify.py` (require `item`), `tests/test_alts.py` (command list), `README.md`.
- Create `tests/test_item_catalog.py`, `tests/test_item_sync.py`, `tests/test_items_discord.py`.
- Create `exalted-item-sync.service`, `exalted-item-sync.timer`, `deploy-item-links.py`.

Run bot tests from `D:\website\aion\output\exalted-bot` with `py -3.10 -B -m unittest discover -s tests -q`, or `python -B -m unittest discover -s tests -q` (local `python` is 3.10.0). Run website tests from `D:\website\aion` with `node --test tests/*.test.mjs`.

---

### Task 1: Preflight

**Files:** none changed.

- [ ] **Step 1: Confirm the bot copy still matches the host**

Run from `D:\website\aion\output\exalted-bot`:

```bash
ssh -o BatchMode=yes oldcg 'cd /home/kcam/bots/exalted && sha256sum exalted/*.py tests/*.py requirements.txt' | sort -k2 > /tmp/remote.sha
sha256sum exalted/*.py tests/*.py requirements.txt | sed 's/ \*/  /' | sort -k2 > /tmp/local.sha
diff /tmp/remote.sha /tmp/local.sha && echo MATCH
```

Expected: `MATCH`. If anything differs, stop. Copy the host version down and re-read it before continuing; never overwrite newer host code.

- [ ] **Step 2: Confirm both test suites pass before changes**

```bash
cd /d/website/aion/output/exalted-bot && python -B -m unittest discover -s tests -q
cd /d/website/aion && node --test tests/*.test.mjs
```

Expected on 2026-10-11: the bot reports `Ran 275 tests` and `OK`; the website reports `pass 86`, `fail 0`. If either count differs, note the new baseline; later steps are relative to it. Bot tests print expected warning lines (e.g. "Recruit assignment pending") from failure-path tests; only the final `OK` matters.

- [ ] **Step 3: Confirm the branch**

```bash
cd /d/website/aion && git status -sb | head -1
```

Expected: `## claude/item-links`.

---

### Task 2: Snapshot record validation (`item-data.js`)

**Files:**
- Create: `item-data.js`
- Test: `tests/item-data.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/item-data.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/item-data.test.mjs`
Expected: FAIL with `Cannot find module '.../item-data.js'`.

- [ ] **Step 3: Implement `item-data.js`**

```js
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/item-data.test.mjs`
Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add item-data.js tests/item-data.test.mjs
git -c user.name=kcam01 -c user.email=17442074+kcam01@users.noreply.github.com commit -m "Add item snapshot validation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Gear IDs and the "View item" link

**Files:**
- Modify: `character-sheet.js` (function `item`, around line 16)
- Modify: `app.js` (imports at line 1-3, function `inspectItem` around line 71-85)
- Test: `tests/character-sheet.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/character-sheet.test.mjs`:

```js
test('gear keeps PLAYNC item IDs only when they are plain digits', () => {
  const sheet = buildSheet({}, { equipment: { equipmentList: [
    { id: 110730048, name: 'Mace', slotPosName: 'MainHand', grade: 'Unique' },
    { id: '1.5', name: 'Helm', slotPosName: 'Helmet' },
    { id: '<img src=x>', name: 'Torso', slotPosName: 'Torso' },
    { name: 'Cape', slotPosName: 'Cape' },
  ] } });
  assert.deepEqual(sheet.equipment.map(x => x.id), ['110730048', '', '', '']);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/character-sheet.test.mjs`
Expected: the new test fails (`undefined` instead of `'110730048'`).

- [ ] **Step 3: Keep the ID in `character-sheet.js`**

In `function item(raw, slot = raw.slotPosName)`, add an `id` property to the returned object. The return statement becomes:

```js
  const id = String(raw.id ?? '');
  return {
    id: /^\d{1,12}$/.test(id) ? id : '',
    name: string(raw.name) || 'Unnamed equipment', slot: SLOTS[index]?.[1] || string(slot) || 'Equipment', order: index < 0 ? 99 : index,
    grade, rarity: ['Common', 'Rare', 'Legend', 'Unique', 'Epic', 'Mythic', 'Special'].includes(grade) ? grade.toLowerCase() : 'common',
    icon: safeImage(raw.icon || raw.iconUrl), enchant: number(raw.enchantLevel), exceed: number(raw.exceedLevel), level: number(raw.level),
  };
```

(Insert the `const id` line just above `return {`. Leave the other lines unchanged.)

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/character-sheet.test.mjs`
Expected: all pass.

- [ ] **Step 5: Add the link to the gear popup in `app.js`**

Add to the imports at the top of `app.js`:

```js
import { itemPageUrl } from './item-data.js';
```

In `inspectItem(item)`, replace the line

```js
  $('item-details').replaceChildren(summary, stats, el('p', 'data-note', 'Equipped item details shared by PLAYNC. Additional item effects are not included in the public character summary.'));
```

with

```js
  const parts = [summary, stats];
  if (item.id) {
    const link = el('a', 'text-button item-page-link', 'View item →');
    link.href = itemPageUrl(item.id);
    parts.push(link);
  }
  parts.push(el('p', 'data-note', 'Equipped item details shared by PLAYNC. Additional item effects are not included in the public character summary.'));
  $('item-details').replaceChildren(...parts);
```

Append this rule to the end of `style.css`, so the link sits below the stats grid with spacing:

```css
.item-page-link{display:inline-block;margin-top:18px}
```

- [ ] **Step 6: Syntax check and full suite**

```bash
node --check app.js && node --check character-sheet.js && node --test tests/*.test.mjs
```

Expected: no syntax errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add character-sheet.js app.js style.css tests/character-sheet.test.mjs
git -c user.name=kcam01 -c user.email=17442074+kcam01@users.noreply.github.com commit -m "Link character-sheet gear to item pages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The `/item` page

**Files:**
- Create: `item.html`, `item.css`, `item.js`

There are no DOM unit tests in this repository. The page logic lives in `item-data.js` (Task 2) and is checked in the browser in Task 14.

- [ ] **Step 1: Create `item.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Item · Exalted</title>
  <meta name="description" content="AION 2 item details for the Exalted guild: grade, type, levels, base stats and random stat ranges.">
  <meta name="theme-color" content="#0c0d14">
  <meta property="og:site_name" content="Exalted"><meta property="og:title" content="AION 2 Items · Exalted"><meta property="og:type" content="website">
  <meta property="og:image" content="https://exalted-aion2.vercel.app/assets/exalted-crest-512.png"><meta name="twitter:card" content="summary">
  <link rel="icon" type="image/png" sizes="64x64" href="/assets/exalted-crest-64.png"><link rel="apple-touch-icon" href="/assets/exalted-crest-192.png">
  <link rel="stylesheet" href="/style.css">
  <link rel="preload" as="image" href="/assets/atreia-background.webp" media="(min-width: 761px)">
  <link rel="preload" as="image" href="/assets/atreia-background-mobile.webp" media="(max-width: 760px)">
  <link rel="stylesheet" href="/background.css">
  <link rel="stylesheet" href="/item.css">
</head>
<body class="aion-world aion-world--profile">
  <a class="skip-link" href="#item">Skip to item details</a>
  <noscript><p class="notice">Enable JavaScript to load item details. <a href="/">Return to Exalted</a>.</p></noscript>
  <div class="page-shell">
    <header class="site-header">
      <a class="guild-home" href="/"><span aria-hidden="true">←</span><img src="/assets/exalted-crest-64.png" alt="" width="28" height="28"><span>EXALTED <small>Items</small></span></a>
      <a id="questlog-link" class="official-link" target="_blank" rel="noopener noreferrer" hidden>View on questlog.gg <span aria-hidden="true">↗</span></a>
    </header>
    <main id="item">
      <div id="item-status" class="notice item-status" role="status">
        <p id="item-message">Loading item…</p>
        <button type="button" id="retry" class="item-retry" hidden>Retry</button>
      </div>
      <article id="item-card" class="panel item-card" aria-labelledby="item-name" hidden>
        <div class="item-hero">
          <span class="item-art item-art--large"><span id="item-initial" class="item-initial" aria-hidden="true"></span><img id="item-icon" alt="" width="78" height="78" hidden></span>
          <div class="item-identity">
            <h1 id="item-name">Item</h1>
            <p id="item-meta" class="item-meta"></p>
          </div>
        </div>
        <dl id="item-facts" class="item-list" hidden></dl>
        <section id="base-stats" class="item-section" aria-labelledby="base-stats-title" hidden>
          <h2 id="base-stats-title">Base stats</h2>
          <dl id="base-stat-list" class="item-list"></dl>
        </section>
        <section id="random-stats" class="item-section" aria-labelledby="random-stats-title" hidden>
          <h2 id="random-stats-title">Random stats</h2>
          <p id="random-stats-note" class="section-description"></p>
          <dl id="random-stat-list" class="item-list"></dl>
        </section>
        <p class="data-note">Item data from questlog.gg, refreshed daily. Grade names match PLAYNC character sheets. <a id="full-details" class="text-button" target="_blank" rel="noopener noreferrer">Full details on questlog.gg ↗</a></p>
      </article>
    </main>
    <footer><a href="/">← Exalted</a><p>Item artwork © NCSOFT. Item data from questlog.gg.</p><span>EXALTED · NA EAST</span></footer>
  </div>
  <script type="module" src="/item.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `item.css`**

```css
/* /item page. Rarity colours come from the shared gear classes in style.css. */
#item{--rarity:#bfc1ce;--rarity-border:#3b3e50;--rarity-bg:#171820;padding-bottom:12px}
.item-status{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.item-status p{margin:0}
.item-retry{border:1px solid #5e4e2d;border-radius:8px;background:#1b1710;padding:8px 16px;font-weight:600;font-size:12px;min-height:40px}
.item-retry:hover{background:#2a2316}
.item-card{border-color:var(--rarity-border);max-width:880px}
.item-hero{display:flex;align-items:center;gap:20px;margin-bottom:24px;min-width:0}
.item-art--large{width:78px;height:78px;display:grid;place-items:center;flex:none}
.item-art--large img{position:absolute;inset:0}
.item-initial{font:28px/1 var(--serif);color:var(--rarity)}
.item-identity{min-width:0}
.item-identity h1{color:var(--rarity);margin:0 0 6px}
.item-meta{margin:0;color:var(--muted);font-size:13px}
.item-section h2{font:normal 20px/1.3 var(--serif);margin:0 0 12px}
.item-section .section-description{margin-bottom:12px}
.item-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0 24px;margin:0 0 26px}
.item-list div{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:8px 0;border-bottom:1px solid var(--line);min-width:0}
.item-list dt{color:var(--muted);font-size:12px;min-width:0;overflow-wrap:anywhere}
.item-list dd{margin:0;font:13px Consolas,monospace;text-align:right;white-space:nowrap}
@media(max-width:480px){
  .item-hero{align-items:flex-start;gap:14px}
  .item-art--large{width:58px;height:58px}
  .item-list{grid-template-columns:1fr}
}
```

- [ ] **Step 3: Create `item.js`**

```js
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
```

- [ ] **Step 4: Syntax check and run the suite**

```bash
node --check item.js && node --check item-data.js && node --test tests/*.test.mjs
```

Expected: no errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add item.html item.css item.js
git -c user.name=kcam01 -c user.email=17442074+kcam01@users.noreply.github.com commit -m "Add the Exalted item page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Label tables (`exalted/item_labels.py`)

Work in `D:\website\aion\output\exalted-bot` from here through Task 12.

**Files:**
- Create: `exalted/item_labels.py`
- Test: `tests/test_item_catalog.py` (first part)

Sources for these tables, recorded on 2026-10-11:
- Category and type labels come from questlog's English `messages.json` (`a2.mainCategory`, `a2.subCategory`), limited to categories present in the catalog.
- Stat labels and formats come from pairing `itemStats` IDs with questlog's rendered rows for 89 sample items.
- Stat order follows questlog's own stat groups (main, attributes, attack, defense, abnormal, pvp, recovery), followed by stats outside those groups.

- [ ] **Step 1: Write the failing coverage tests**

Create `tests/test_item_catalog.py`:

```python
import io
import json
import unittest
import urllib.error

from exalted import item_labels as labels

SURVEYED_STATS = {
    'abnormalaccuracy', 'abnormalresistance', 'additionalhitrate', 'additionalhitresistrate', 'agi', 'amplifyalldamage',
    'amplifycriticaldamage', 'amplifyhphealget', 'amplifyweapondamage', 'armordefense', 'armorevasion', 'backattackdamage',
    'backattackdefense', 'block', 'combatspeed', 'con', 'critical', 'criticaladddamage', 'criticaldamagedefense',
    'criticalresist', 'damageratio', 'death', 'decreasecriticaldamage', 'decreasedamage', 'decreaseshieldblock',
    'decreaseweaponblock', 'decreaseweapondamage', 'defensepierce', 'defenseratio', 'destiny', 'destruction', 'dex', 'fpmax',
    'freedom', 'frontattackdamage', 'frontattackdefense', 'hardhit', 'hardhitresist', 'hpmax', 'hppotionrate', 'hpregen',
    'ignoreironwall', 'illusion', 'int', 'ironwall', 'justice', 'life', 'maxshieldblock', 'maxweaponblock', 'movespeed',
    'mpmax', 'mpregen', 'perfect', 'perfectresist', 'pveamplifydamage', 'pvedecreasedamage', 'pvpamplifydamage',
    'restoration', 'sealstoneadddamage', 'space', 'str', 'time', 'weaponaccuracy', 'weapondamage', 'weaponfixingdamage',
    'wis', 'wisdom'}
SURVEYED_TYPES = {
    'addcontentsticketcount', 'addcontentstickettime', 'amulet', 'arcanamaterial', 'artwork', 'ascensiongrade', 'battlepass',
    'bell', 'belt', 'boots', 'bow', 'bracelet', 'cape', 'characterslotunlock', 'colossus', 'compass', 'contentssweepticket',
    'conversionrecipe', 'conversionresource', 'conversionresource_special', 'craftmastery', 'craftresource',
    'createarcanamaterial', 'customize', 'dagger', 'drink', 'earring', 'elevate', 'extension', 'food', 'gather',
    'gathermastery', 'gatherresource', 'gauntlet', 'getarcana', 'getgamecash', 'getgodstone', 'getpoint', 'getsocialaction',
    'gettitle', 'getwing', 'gloves', 'grail', 'greatsword', 'guarder', 'helmet', 'kinabox', 'mace', 'magicbook',
    'magicstone', 'material', 'mirror', 'misc', 'monolithallclear', 'monolithtoken', 'necklace', 'note',
    'occupationterritoryallclear', 'orb', 'pants', 'parchment', 'petpolymorph', 'polymorph', 'potion', 'questscroll',
    'rebirth', 'rewardbox', 'ring', 'rune', 'scroll', 'sealallclear', 'sealstone', 'setupkisk', 'shoulder', 'skincombine',
    'skinextraction', 'skinshop', 'souladd', 'staff', 'statue', 'subscribe', 'succession', 'surpass', 'sword',
    'teleportscroll', 'ticket', 'torso', 'vehiclesoul', 'vehiclesoulcrystal'}
SURVEYED_CATEGORIES = {'accessory', 'arcana', 'armor', 'currency', 'equip', 'misc', 'pantheon', 'usable', 'weapon'}


class LabelTableTests(unittest.TestCase):
    def test_every_surveyed_id_has_a_label(self):
        self.assertLessEqual(SURVEYED_STATS, set(labels.STATS))
        self.assertLessEqual(SURVEYED_TYPES, set(labels.TYPES))
        self.assertEqual(SURVEYED_CATEGORIES, set(labels.CATEGORIES))

    def test_stat_kinds_and_grade_names(self):
        self.assertEqual({kind for _, kind in labels.STATS.values()}, {'flat', 'percent', 'hundredths'})
        self.assertEqual(labels.STATS['combatspeed'], ('Combat Speed', 'percent'))
        self.assertEqual(labels.STATS['fpmax'], ('Flight Power', 'hundredths'))
        self.assertEqual(list(labels.STATS)[:3], ['weapondamage', 'weaponaccuracy', 'critical'])
        self.assertEqual(labels.GRADES, {11: 'Common', 21: 'Rare', 31: 'Legend', 41: 'Unique', 71: 'Special'})
        self.assertEqual(labels.QUESTLOG_GRADES[51], 'Mythic')
```

- [ ] **Step 2: Run and confirm failure**

Run: `python -B -m unittest discover -s tests -p "test_item_catalog.py" -q`
Expected: `ModuleNotFoundError: No module named 'exalted.item_labels'`.

- [ ] **Step 3: Create `exalted/item_labels.py`**

```python
"""Display tables for the AION 2 item snapshot (questlog.gg English labels, PLAYNC grade names; 2026-10-11)."""

# PLAYNC grade names, confirmed against roster gear. Other codes fall back to QUESTLOG_GRADES and are logged.
GRADES = {11: 'Common', 21: 'Rare', 31: 'Legend', 41: 'Unique', 71: 'Special'}
QUESTLOG_GRADES = {11: 'Common', 21: 'Rare', 31: 'Epic', 41: 'Legend', 51: 'Mythic', 61: 'Unique', 71: 'Special'}
# The gear rarity classes shared with the website's style.css and item-data.js.
RARITIES = ('common', 'rare', 'legend', 'unique', 'epic', 'mythic', 'special')

CATEGORIES = {
    'accessory': 'Accessories', 'arcana': 'Arcana', 'armor': 'Armor', 'currency': 'Currency', 'equip': 'Equipment',
    'misc': 'Misc', 'pantheon': 'Pantheon', 'usable': 'Usable', 'weapon': 'Weapons',
}

TYPES = {
    'addcontentsticketcount': 'Add Contents Ticket Count', 'addcontentstickettime': 'Add Contents Ticket Time',
    'amulet': 'Amulet', 'arcanamaterial': 'Arcana Material', 'artwork': 'Artwork', 'ascensiongrade': 'Ascension Grade',
    'battlepass': 'Battle Pass', 'bell': 'Bell', 'belt': 'Belt', 'boots': 'Shoes', 'bow': 'Bow', 'bracelet': 'Bracelet',
    'cape': 'Cloak', 'characterslotunlock': 'Character Slot Unlock', 'colossus': 'Colossus', 'compass': 'Compass',
    'contentssweepticket': 'Sweep Ticket', 'conversionrecipe': 'Conversion Recipe',
    'conversionresource': 'Conversion Resource', 'conversionresource_special': 'Conversion Resource Special',
    'craftmastery': 'Craft Mastery', 'craftresource': 'Craft Resource', 'createarcanamaterial': 'Create Arcana Material',
    'customize': 'Customize', 'dagger': 'Dagger', 'drink': 'Drink', 'earring': 'Earrings', 'elevate': 'Elevate',
    'extension': 'Extension', 'food': 'Food', 'gather': 'Gather', 'gathermastery': 'Gather Mastery',
    'gatherresource': 'Gather Resource', 'gauntlet': 'Gauntlet', 'getarcana': 'Get Arcana', 'getgamecash': 'Get Game Cash',
    'getgodstone': 'Get Godstone', 'getpoint': 'Get Point', 'getsocialaction': 'Get Social Action', 'gettitle': 'Get Title',
    'getwing': 'Get Wing', 'gloves': 'Gloves', 'grail': 'Grail', 'greatsword': 'Greatsword', 'guarder': 'Guard',
    'helmet': 'Helm', 'kinabox': 'Kina Box', 'mace': 'Mace', 'magicbook': 'Spellbook', 'magicstone': 'Magic Stone',
    'material': 'Material', 'mirror': 'Mirror', 'misc': 'Miscellaneous', 'monolithallclear': 'Monolith All Clear',
    'monolithtoken': 'Monolith Token', 'necklace': 'Necklace', 'note': 'Note',
    'occupationterritoryallclear': 'Territory All Clear', 'orb': 'Orb', 'pants': 'Legs', 'parchment': 'Parchment',
    'petpolymorph': 'Pet Polymorph', 'polymorph': 'Polymorph', 'potion': 'Potion', 'questscroll': 'Quest Scroll',
    'rebirth': 'Rebirth', 'rewardbox': 'Reward Box', 'ring': 'Ring', 'rune': 'Rune', 'scroll': 'Scroll',
    'sealallclear': 'Seal All Clear', 'sealstone': 'Seal Stone', 'setupkisk': 'Setup Kisk', 'shoulder': 'Pauldrons',
    'skincombine': 'Skin Combine', 'skinextraction': 'Skin Extraction', 'skinshop': 'Skin Shop', 'souladd': 'Soul Add',
    'staff': 'Staff', 'statue': 'Statue', 'subscribe': 'Subscribe', 'succession': 'Succession', 'surpass': 'Potential',
    'sword': 'Sword', 'teleportscroll': 'Teleport Scroll', 'ticket': 'Ticket', 'torso': 'Breastplate',
    'vehiclesoul': 'Vehicle Soul', 'vehiclesoulcrystal': 'Vehicle Soul Crystal',
}

# Display order. flat: whole numbers; percent: hundredths shown with %; hundredths: hundredths without %.
STATS = {
    'weapondamage': ('Attack', 'flat'), 'weaponaccuracy': ('Accuracy', 'flat'), 'critical': ('Critical Hit', 'flat'),
    'hpmax': ('HP', 'flat'), 'mpmax': ('MP', 'flat'), 'armordefense': ('Defense', 'flat'),
    'armorevasion': ('Evasion', 'flat'), 'criticalresist': ('Critical Hit Resist', 'flat'),
    'combatspeed': ('Combat Speed', 'percent'), 'movespeed': ('Move Speed', 'percent'),
    'str': ('Might', 'flat'), 'dex': ('Dexterity', 'flat'), 'int': ('Intelligence', 'flat'),
    'con': ('Constitution', 'flat'), 'agi': ('Precision', 'flat'), 'wis': ('Willpower', 'flat'),
    'weaponfixingdamage': ('Attack', 'flat'), 'defensepierce': ('Penetration', 'flat'),
    'criticaladddamage': ('Critical Attack', 'flat'), 'backattackdamage': ('Back Attack', 'flat'),
    'frontattackdamage': ('Front Attack', 'flat'), 'amplifyalldamage': ('Damage Boost', 'percent'),
    'amplifycriticaldamage': ('Critical Damage Boost', 'percent'),
    'amplifyweapondamage': ('Weapon Damage Boost', 'percent'), 'decreasedamage': ('Damage Tolerance', 'percent'),
    'decreasecriticaldamage': ('Critical Damage Tolerance', 'percent'),
    'decreaseweapondamage': ('Weapon Damage Tolerance', 'percent'),
    'additionalhitrate': ('Multi-hit Chance', 'percent'), 'perfect': ('Perfect Chance', 'percent'),
    'hardhit': ('Double Chance', 'percent'), 'restoration': ('Regeneration', 'percent'),
    'ironwall': ('Endurance', 'percent'), 'perfectresist': ('Perfect Resist', 'percent'),
    'hardhitresist': ('Double Resist', 'percent'), 'ignoreironwall': ('Endurance Penetration', 'percent'),
    'criticaldamagedefense': ('Critical Damage Defense', 'flat'),
    'maxweaponblock': ('Parry Damage Reduction Amount', 'flat'),
    'maxshieldblock': ('Shield Block Damage Reduction Amount', 'flat'),
    'backattackdefense': ('Back Defense', 'flat'), 'frontattackdefense': ('Front Defense', 'flat'),
    'decreaseweaponblock': ('Parry Damage Reduction Rate', 'percent'),
    'decreaseshieldblock': ('Shield Block Damage Reduction Rate', 'percent'),
    'additionalhitresistrate': ('Multi-hit Resist', 'percent'), 'defenseratio': ('Defense increase', 'percent'),
    'block': ('Block', 'flat'), 'abnormalaccuracy': ('Status Effect Chance', 'percent'),
    'abnormalresistance': ('Status Effect Resist', 'percent'), 'pvpamplifydamage': ('PvP Damage Boost', 'percent'),
    'hpregen': ('Natural HP Regen', 'flat'), 'mpregen': ('Natural MP Regen', 'flat'),
    'hppotionrate': ('HP Potion Recovery increase', 'percent'), 'amplifyhphealget': ('Incoming Heal', 'percent'),
    'damageratio': ('Attack increase', 'percent'), 'pveamplifydamage': ('PvE Damage Boost', 'percent'),
    'pvedecreasedamage': ('PvE Damage Tolerance', 'percent'),
    'sealstoneadddamage': ('Power Shard Damage Bonus', 'flat'), 'fpmax': ('Flight Power', 'hundredths'),
    'justice': ('Justice [Nezekan]', 'flat'), 'freedom': ('Freedom [Vaizel]', 'flat'),
    'illusion': ('Illusion [Kaisinel]', 'flat'), 'life': ('Life [Yustiel]', 'flat'), 'time': ('Time [Siel]', 'flat'),
    'destruction': ('Destruction [Zikel]', 'flat'), 'death': ('Death [Triniel]', 'flat'),
    'wisdom': ('Wisdom [Lumiel]', 'flat'), 'destiny': ('Destiny [Marchutan]', 'flat'), 'space': ('Space [Israphel]', 'flat'),
}
```

- [ ] **Step 4: Run and confirm the tests pass**

Run: `python -B -m unittest discover -s tests -p "test_item_catalog.py" -q`
Expected: `OK` (2 tests).

---

### Task 6: Catalog trimming and formatting (`exalted/item_catalog.py`, part 1)

**Files:**
- Create: `exalted/item_catalog.py`
- Test: `tests/test_item_catalog.py` (append)

The Ludra fixture below is a subset of the live `database.getItem` response for `110120003`, captured on 2026-10-11. Its expected output matches what questlog itself renders.

- [ ] **Step 1: Append the failing tests**

Append to `tests/test_item_catalog.py` (keep the existing imports; add `from exalted import item_catalog as catalog` to the import block):

```python
LUDRA_ROW = {'id': '110120003', 'name': "Ludra's Blade of Extinction", 'grade': 41, 'mainCategory': 'weapon',
             'subCategory': 'greatsword', 'dbType': 'item', 'isDisabled': False,
             'icon': '/assets/Game/UI/Resource/Texture/Item/Weapon/Icon_WP_GS_0108_T06.Icon_WP_GS_0108_T06'}
LUDRA_DETAIL = {
    'id': '110120003', 'isSellable': True, 'sellPrice': 59720, 'minLevelRequirement': 45,
    'equipmentInfo': {'itemLevel': 102, 'soulbindRandomStatCount': 3},
    'itemStats': {
        'mainStats': {'block': 150, 'critical': 150, 'weapondamage': 604, 'maxweaponblock': 100000,
                      'weaponaccuracy': 100, 'weaponmindamage': 446, 'decreaseweaponblock': 3300},
        'subStats': [{'id': i, 'type': 'stat', 'minValue': lo, 'maxValue': hi} for i, lo, hi in [
            ('combatspeed', 1123, 1298), ('amplifyalldamage', 629, 730), ('additionalhitrate', 832, 964),
            ('amplifyweapondamage', 832, 964), ('abnormalaccuracy', 2220, 2560), ('str', 22, 32), ('agi', 22, 32),
            ('weaponfixingdamage', 38, 51), ('critical', 59, 75), ('criticaladddamage', 83, 102),
            ('backattackdamage', 83, 102), ('frontattackdamage', 83, 102), ('weaponaccuracy', 79, 98),
            ('block', 48, 62), ('mpmax', 177, 211), ('hpmax', 357, 418)]]}}
LUDRA_RECORD = {
    'id': '110120003', 'name': "Ludra's Blade of Extinction", 'grade': 'Unique', 'rarity': 'unique',
    'type': 'Greatsword', 'category': 'Weapons',
    'icon': 'https://assets.playnccdn.com/static-aion2-gamedata/resources/Icon_WP_GS_0108_T06.png',
    'itemLevel': 102, 'requiredLevel': 45, 'sellPrice': 59720,
    'stats': [{'label': 'Attack', 'value': '446 ~ 604'}, {'label': 'Accuracy', 'value': '100'},
              {'label': 'Critical Hit', 'value': '150'}, {'label': 'Parry Damage Reduction Amount', 'value': '100,000'},
              {'label': 'Parry Damage Reduction Rate', 'value': '33%'}, {'label': 'Block', 'value': '150'}],
    'randomStats': {'picks': 3, 'stats': [
        {'label': 'Accuracy', 'value': '79 – 98'}, {'label': 'Critical Hit', 'value': '59 – 75'},
        {'label': 'HP', 'value': '357 – 418'}, {'label': 'MP', 'value': '177 – 211'},
        {'label': 'Combat Speed', 'value': '11.2% – 13%'}, {'label': 'Might', 'value': '22 – 32'},
        {'label': 'Precision', 'value': '22 – 32'}, {'label': 'Attack', 'value': '38 – 51'},
        {'label': 'Critical Attack', 'value': '83 – 102'}, {'label': 'Back Attack', 'value': '83 – 102'},
        {'label': 'Front Attack', 'value': '83 – 102'}, {'label': 'Damage Boost', 'value': '6.29% – 7.3%'},
        {'label': 'Weapon Damage Boost', 'value': '8.32% – 9.64%'},
        {'label': 'Multi-hit Chance', 'value': '8.32% – 9.64%'}, {'label': 'Block', 'value': '48 – 62'},
        {'label': 'Status Effect Chance', 'value': '22.2% – 25.6%'}]}}


class TrimTests(unittest.TestCase):
    def test_three_significant_figures_match_questlog(self):
        cases = {12.98: '13', 11.23: '11.2', 11.25: '11.3', 241.57: '242', 96.6: '96.6', 0.98: '0.98',
                 0.5: '0.5', 100: '100', 99.95: '100', 0: '0', 1234.5: '1230'}
        for value, text in cases.items():
            self.assertEqual(catalog.sig3(value), text, value)

    def test_stat_formats(self):
        self.assertEqual(catalog.format_stat('combatspeed', 1298), '13%')
        self.assertEqual(catalog.format_stat('fpmax', 24157), '242')
        self.assertEqual(catalog.format_stat('maxweaponblock', 100000), '100,000')
        self.assertEqual(catalog.format_stat('unknownstat', 1500), '1,500')

    def test_listing_validates_rows_and_maps_icons(self):
        entry = catalog.listing(LUDRA_ROW)
        self.assertEqual(entry, {'id': '110120003', 'name': "Ludra's Blade of Extinction", 'grade': 41, 'main': 'weapon',
                                 'sub': 'greatsword', 'icon': LUDRA_RECORD['icon']})
        for bad in [{**LUDRA_ROW, 'isDisabled': True}, {**LUDRA_ROW, 'id': '11a'}, {**LUDRA_ROW, 'name': 'A\x07B'},
                    {**LUDRA_ROW, 'name': '  '}, {**LUDRA_ROW, 'grade': '41'}, {**LUDRA_ROW, 'dbType': 'npc'}, None]:
            self.assertIsNone(catalog.listing(bad))
        self.assertIsNone(catalog.icon_url('https://evil.example/Icon.png'))
        self.assertIsNone(catalog.icon_url('/assets/Item/Icon_A.Icon_B'))

    def test_full_weapon_record_matches_questlog_rendering(self):
        unknown = set()
        record = catalog.trim(catalog.listing(LUDRA_ROW), catalog.detail_subset(LUDRA_DETAIL), unknown)
        self.assertEqual(record, LUDRA_RECORD)
        self.assertEqual(unknown, set())

    def test_listing_only_and_low_level_items_omit_empty_sections(self):
        row = {'id': '530116010', 'name': 'Superior Life Serum (Bound)', 'grade': 11, 'mainCategory': 'usable',
               'subCategory': 'potion', 'icon': '/assets/Item/ETC/Icon_Potion_01.Icon_Potion_01'}
        self.assertEqual(catalog.trim(catalog.listing(row), None, set()), {
            'id': '530116010', 'name': 'Superior Life Serum (Bound)', 'grade': 'Common', 'rarity': 'common',
            'type': 'Potion', 'category': 'Usable',
            'icon': 'https://assets.playnccdn.com/static-aion2-gamedata/resources/Icon_Potion_01.png'})
        detail = catalog.detail_subset({'isSellable': False, 'sellPrice': 1, 'minLevelRequirement': 1})
        self.assertNotIn('sellPrice', catalog.trim(catalog.listing(row), detail, set()))
        self.assertNotIn('requiredLevel', catalog.trim(catalog.listing(row), detail, set()))

    def test_unknown_ids_fall_back_and_are_reported(self):
        row = {**LUDRA_ROW, 'grade': 51, 'mainCategory': 'newmain', 'subCategory': 'new_type'}
        detail = catalog.detail_subset({'itemStats': {'mainStats': {'mysterystat': 7, 'weaponmindamage': 5}}})
        unknown = set()
        record = catalog.trim(catalog.listing(row), detail, unknown)
        self.assertEqual((record['grade'], record['rarity'], record['category'], record['type']),
                         ('Mythic', 'mythic', 'Newmain', 'New Type'))
        self.assertEqual(record['stats'], [{'label': 'Attack', 'value': '5'}, {'label': 'mysterystat', 'value': '7'}])
        self.assertEqual(unknown, {'grade:51', 'category:newmain', 'type:new_type', 'stat:mysterystat'})

    def test_items_without_a_type_use_their_category(self):
        row = {**LUDRA_ROW, 'mainCategory': 'currency', 'subCategory': None}
        self.assertEqual(catalog.trim(catalog.listing(row), None, set())['type'], 'Currency')

    def test_detail_subset_rejects_bad_shapes_and_skips_bad_values(self):
        for bad in [None, [], {'itemStats': []}, {'itemStats': {'mainStats': []}}, {'equipmentInfo': 'x'}]:
            with self.assertRaises(ValueError):
                catalog.detail_subset(bad)
        subset = catalog.detail_subset({'itemStats': {'mainStats': {'block': -1, 'Bad Id': 3, 'critical': True},
                                                      'subStats': [{'id': 'skillx', 'type': 'skill', 'minValue': 1, 'maxValue': 2}]}})
        self.assertEqual((subset['main'], subset['sub']), ([], []))
```

- [ ] **Step 2: Run and confirm failure**

Run: `python -B -m unittest discover -s tests -p "test_item_catalog.py" -q`
Expected: `ModuleNotFoundError: No module named 'exalted.item_catalog'`.

- [ ] **Step 3: Create `exalted/item_catalog.py` with the trimming half**

```python
"""questlog.gg AION 2 item catalog: polite client, partitioned crawl, trimming, and website shards."""
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from decimal import ROUND_HALF_UP, Decimal

from .item_labels import CATEGORIES, GRADES, QUESTLOG_GRADES, RARITIES, STATS, TYPES

API = 'https://questlog.gg/aion-2/api/trpc/'
USER_AGENT = 'ExaltedItemSync/1.0 (+https://exalted-aion2.vercel.app)'
ICON_BASE = 'https://assets.playnccdn.com/static-aion2-gamedata/resources/'
ID = re.compile(r'\d{1,12}')
STAT_ID = re.compile(r'[a-z0-9_]{1,40}')
ICON_NAME = re.compile(r'/assets/[A-Za-z0-9_/-]+/([A-Za-z0-9_-]+)\.\1')
CONTROL = re.compile(r'[\x00-\x1f\x7f]')
ORDER = {stat_id: index for index, stat_id in enumerate(STATS)}


class SourceError(RuntimeError):
    """questlog was unreachable or returned an unexpected shape."""


def icon_url(path):
    match = ICON_NAME.fullmatch(path) if isinstance(path, str) else None
    return ICON_BASE + match.group(1) + '.png' if match else None


def listing(row):
    """Validate one list row. Returns None for disabled or malformed rows."""
    if not isinstance(row, dict) or row.get('isDisabled') or row.get('dbType', 'item') != 'item':
        return None
    item_id, name, grade = str(row.get('id', '')), row.get('name'), row.get('grade')
    if (not ID.fullmatch(item_id) or not isinstance(name, str) or not name.strip() or len(name) > 200
            or CONTROL.search(name) or not isinstance(grade, int) or isinstance(grade, bool)):
        return None
    return {'id': item_id, 'name': ' '.join(name.split()), 'grade': grade, 'main': str(row.get('mainCategory') or ''),
            'sub': str(row.get('subCategory') or ''), 'icon': icon_url(row.get('icon'))}


def _whole(value):
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def _part(raw, key, kind):
    value = raw.get(key)
    if value is None:
        return kind()
    if not isinstance(value, kind):
        raise ValueError(f'Invalid item detail field {key}')
    return value


def detail_subset(raw):
    """Keep only the detail fields the snapshot uses, so the cache stays small and re-trimmable."""
    if not isinstance(raw, dict):
        raise ValueError('Invalid item detail')
    info, stats = _part(raw, 'equipmentInfo', dict), _part(raw, 'itemStats', dict)
    main_stats, sub_stats = _part(stats, 'mainStats', dict), _part(stats, 'subStats', list)
    main = [[key, value] for key, value in main_stats.items()
            if isinstance(key, str) and STAT_ID.fullmatch(key) and _whole(value) is not None]
    sub = [[stat['id'], stat['minValue'], stat['maxValue']] for stat in sub_stats
           if isinstance(stat, dict) and stat.get('type', 'stat') == 'stat' and isinstance(stat.get('id'), str)
           and STAT_ID.fullmatch(stat['id']) and _whole(stat.get('minValue')) is not None
           and _whole(stat.get('maxValue')) is not None]
    return {'sellPrice': _whole(raw.get('sellPrice')) if raw.get('isSellable') is True else None,
            'requiredLevel': _whole(raw.get('minLevelRequirement')), 'itemLevel': _whole(info.get('itemLevel')),
            'picks': _whole(info.get('soulbindRandomStatCount')), 'main': main, 'sub': sub}


def sig3(value):
    """Three significant figures, rounding like JavaScript's toPrecision(3) as questlog does."""
    if value == 0:
        return '0'
    exact = Decimal(value)
    rounded = exact.quantize(Decimal(1).scaleb(exact.adjusted() - 2), rounding=ROUND_HALF_UP)
    text = format(rounded, 'f')
    return text.rstrip('0').rstrip('.') if '.' in text else text


def format_stat(stat_id, value):
    kind = STATS.get(stat_id, (None, 'flat'))[1]
    if kind == 'percent':
        return sig3(value / 100) + '%'
    if kind == 'hundredths':
        return sig3(value / 100)
    return f'{value:,}'


def _label(stat_id, unknown):
    if stat_id in STATS:
        return STATS[stat_id][0]
    unknown.add('stat:' + stat_id)
    return stat_id


def _fallback(kind, key, unknown):
    unknown.add(f'{kind}:{key}')
    return key.replace('_', ' ').title() or 'Item'


def _ordered(rows):
    return sorted(rows, key=lambda row: (ORDER.get(row[0], len(ORDER)), row[0]))


def grade_name(code, unknown):
    if code in GRADES:
        name = GRADES[code]
    else:
        name = QUESTLOG_GRADES.get(code, f'Grade {code}')
        unknown.add(f'grade:{code}')
    return name, name.lower() if name.lower() in RARITIES else 'common'


def trim(entry, detail, unknown):
    """Build one website record. `detail` is a detail_subset() or None when details are not available yet."""
    grade, rarity = grade_name(entry['grade'], unknown)
    category = CATEGORIES.get(entry['main']) or _fallback('category', entry['main'], unknown)
    if not entry['sub']:
        kind = category
    else:
        kind = TYPES.get(entry['sub']) or _fallback('type', entry['sub'], unknown)
    record = {'id': entry['id'], 'name': entry['name'], 'grade': grade, 'rarity': rarity, 'type': kind,
              'category': category}
    if entry['icon']:
        record['icon'] = entry['icon']
    if not detail:
        return record
    if detail['itemLevel']:
        record['itemLevel'] = detail['itemLevel']
    if detail['requiredLevel'] and detail['requiredLevel'] > 1:
        record['requiredLevel'] = detail['requiredLevel']
    if detail['sellPrice']:
        record['sellPrice'] = detail['sellPrice']
    main = {key: value for key, value in detail['main'] if value}
    low, high = main.pop('weaponmindamage', None), main.pop('weapondamage', None)
    stats = [(key, format_stat(key, value)) for key, value in main.items()]
    if low is not None and high is not None:
        stats.append(('weapondamage', f'{low:,} ~ {high:,}'))
    elif low is not None or high is not None:
        stats.append(('weapondamage', f'{low if high is None else high:,}'))
    if stats:
        record['stats'] = [{'label': _label(key, unknown), 'value': value} for key, value in _ordered(stats)]
    if detail['sub'] and detail['picks']:
        record['randomStats'] = {'picks': detail['picks'], 'stats': [
            {'label': _label(key, unknown), 'value': f'{format_stat(key, low)} – {format_stat(key, high)}'}
            for key, low, high in _ordered(detail['sub'])]}
    return record
```

(The `json`, `time` and `urllib` imports are used in Task 7.)

- [ ] **Step 4: Run and confirm the tests pass**

Run: `python -B -m unittest discover -s tests -p "test_item_catalog.py" -q`
Expected: `OK` (10 tests).

---

### Task 7: questlog client and partitioned crawl (`item_catalog.py`, part 2)

**Files:**
- Modify: `exalted/item_catalog.py` (append)
- Test: `tests/test_item_catalog.py` (append)

`FakeQuestlog` behaves like the live list endpoint: 40 rows per page, at most 1,000 rows per query, and `facetDistribution.grade` counted without the grade filter. Task 9 reuses it.

- [ ] **Step 1: Append the failing tests**

```python
class FakeQuestlog:
    """In-memory stand-in for questlog's list and detail endpoints."""

    def __init__(self, rows, details=None, fail_details=()):
        self.rows, self.details, self.fail_details = rows, details or {}, set(fail_details)
        self.requests, self.detail_calls = 0, []

    def page(self, page, main=None, sub=None, grade=None):
        self.requests += 1
        rows = [r for r in self.rows if (main is None or r['mainCategory'] == main)
                and (sub is None or r.get('subCategory') == sub)]
        grades = {}
        for row in rows:
            grades[row['grade']] = grades.get(row['grade'], 0) + 1
        if grade is not None:
            rows = [r for r in rows if r['grade'] == grade]
        capped = rows[:1000]
        return capped[(page - 1) * 40:page * 40], grades

    def item(self, item_id):
        self.requests += 1
        self.detail_calls.append(item_id)
        if item_id in self.fail_details:
            raise catalog.SourceError('detail unavailable')
        return self.details.get(item_id, {'isSellable': True, 'sellPrice': 10, 'minLevelRequirement': 5})


def make_rows(spec):
    """spec: [(main, sub, grade, count)] -> list rows with unique 9-digit IDs."""
    rows, next_id = [], 100000000
    for main, sub, grade, count in spec:
        for _ in range(count):
            next_id += 1
            rows.append({'id': str(next_id), 'name': f'{main} {sub} {next_id}', 'grade': grade, 'mainCategory': main,
                         'subCategory': sub, 'icon': f'/assets/I/Icon_{next_id}.Icon_{next_id}'})
    return rows


class CrawlTests(unittest.TestCase):
    def test_splits_oversized_categories_by_grade_then_type(self):
        rows = make_rows([('weapon', 'sword', 41, 300), ('usable', 'skinshop', 31, 700), ('usable', 'potion', 31, 450),
                          ('usable', 'potion', 11, 200), ('usable', None, 31, 3)])
        found, report = catalog.crawl(FakeQuestlog(rows))
        self.assertEqual(report['expected'], 1653)
        # The 3 untyped items in the oversized usable/31 bucket are unreachable, as on the live site.
        self.assertEqual(report['collected'], 1650)
        self.assertEqual(len(found), 1650)

    def test_large_shortfall_fails_closed(self):
        rows = make_rows([('usable', 'skinshop', 31, 990), ('usable', None, 31, 60)])
        with self.assertRaisesRegex(catalog.SourceError, 'incomplete'):
            catalog.crawl(FakeQuestlog(rows))

    def test_empty_catalog_fails_closed(self):
        with self.assertRaises(catalog.SourceError):
            catalog.crawl(FakeQuestlog([]))


class Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class ClientTests(unittest.TestCase):
    def client(self, replies):
        calls, sleeps, clock = [], [], iter(range(0, 1000, 1))

        def opener(request, timeout):
            calls.append((request.full_url, request.get_header('User-agent'), timeout))
            reply = replies.pop(0)
            if isinstance(reply, Exception):
                raise reply
            return Response(json.dumps(reply).encode())

        client = catalog.Questlog(opener=opener, sleep=sleeps.append, clock=lambda: next(clock) * 0.25)
        return client, calls, sleeps

    def test_pages_encode_filters_and_pace_requests(self):
        body = {'result': {'data': {'pageData': [], 'pageCount': 0, 'facetDistribution': {'grade': {'31': 4}}}}}
        client, calls, sleeps = self.client([body, body])
        self.assertEqual(client.page(2, 'usable', 'potion', 31), ([], {31: 4}))
        client.page(1)
        self.assertIn('%22facets%22%3A%7B%22grade%22%3A31%7D', calls[0][0])
        self.assertIn('%22subCategory%22%3A%22potion%22', calls[0][0])
        self.assertTrue(calls[0][1].startswith('ExaltedItemSync/'))
        self.assertEqual(calls[0][2], 8)
        self.assertEqual(sleeps, [0.75])  # one second between request starts

    def test_retries_temporary_errors_then_gives_up(self):
        busy = urllib.error.HTTPError('u', 503, 'busy', {}, None)
        body = {'result': {'data': {'id': '1'}}}
        client, calls, sleeps = self.client([busy, body])
        self.assertEqual(client.item('1'), {'id': '1'})
        client, calls, _ = self.client([urllib.error.HTTPError('u', 404, 'missing', {}, None)])
        with self.assertRaisesRegex(catalog.SourceError, '404'):
            client.item('1')
        self.assertEqual(len(calls), 1)
        client, calls, _ = self.client([ValueError('bad json')] * 3)
        with self.assertRaises(catalog.SourceError):
            client.item('1')
        self.assertEqual(len(calls), 3)

    def test_empty_results_have_no_counts_but_rows_must(self):
        empty = {'result': {'data': {'pageData': [], 'pageCount': 0, 'facetDistribution': {}}}}
        client, _, _ = self.client([empty])
        self.assertEqual(client.page(1, 'usable', 'sword'), ([], {}))
        for bad in [{'pageData': 'x', 'facetDistribution': {}}, {'pageData': [LUDRA_ROW], 'facetDistribution': {}},
                    {'pageData': [], 'facetDistribution': {'grade': {'x': 1}}}]:
            client, _, _ = self.client([{'result': {'data': bad}}])
            with self.assertRaises(catalog.SourceError):
                client.page(1)
```

- [ ] **Step 2: Run and confirm failure**

Run: `python -B -m unittest discover -s tests -p "test_item_catalog.py" -q`
Expected: errors such as `AttributeError: module 'exalted.item_catalog' has no attribute 'crawl'`.

- [ ] **Step 3: Append the client and crawl to `exalted/item_catalog.py`**

```python
PAGE_SIZE = 40
QUERY_CAP = 1000          # questlog returns at most this many rows for any single filter combination
MIN_COVERAGE = 0.99       # a few untyped items inside oversized buckets cannot be reached


class Questlog:
    """Sequential client: one request per `pace` seconds, short retries for temporary failures."""

    def __init__(self, opener=urllib.request.urlopen, sleep=time.sleep, clock=time.monotonic, pace=1.0, retries=2):
        self.opener, self.sleep, self.clock, self.pace, self.retries = opener, sleep, clock, pace, retries
        self.last, self.requests = None, 0

    def _wait(self):
        if self.last is not None:
            delay = self.pace - (self.clock() - self.last)
            if delay > 0:
                self.sleep(delay)
        self.last = self.clock()

    def call(self, procedure, payload):
        url = API + procedure + '?input=' + urllib.parse.quote(json.dumps(payload, separators=(',', ':')))
        request = urllib.request.Request(url, headers={'accept': 'application/json', 'user-agent': USER_AGENT})
        for attempt in range(self.retries + 1):
            self._wait()
            self.requests += 1
            try:
                with self.opener(request, timeout=8) as response:
                    data = json.loads(response.read().decode('utf-8'))['result']['data']
                if not isinstance(data, dict):
                    raise SourceError('Unexpected questlog response')
                return data
            except urllib.error.HTTPError as exc:
                if exc.code not in (429, 500, 502, 503, 504) or attempt == self.retries:
                    raise SourceError(f'questlog HTTP {exc.code}') from None
            except (urllib.error.URLError, OSError, ValueError, KeyError, TypeError) as exc:
                if attempt == self.retries:
                    raise SourceError(f'questlog request failed ({type(exc).__name__})') from None
            self.sleep(5 * (attempt + 1))

    def page(self, page, main=None, sub=None, grade=None):
        payload = {'language': 'en', 'page': page}
        if main:
            payload['mainCategory'] = main
        if sub:
            payload['subCategory'] = sub
        if grade is not None:
            payload['facets'] = {'grade': grade}
        data = self.call('database.getItems', payload)
        rows, facets = data.get('pageData'), data.get('facetDistribution')
        try:
            if not isinstance(rows, list) or not isinstance(facets, dict):
                raise TypeError
            # Empty results come back with "facetDistribution": {}; non-empty ones must carry grade counts.
            grades = facets.get('grade', None if rows else {})
            if not isinstance(grades, dict):
                raise TypeError
            return rows, {int(key): int(value) for key, value in grades.items()}
        except (TypeError, ValueError):
            raise SourceError('Unexpected questlog item list') from None

    def item(self, item_id):
        return self.call('database.getItem', {'language': 'en', 'id': item_id})


def crawl(client, mains=tuple(CATEGORIES), subs=tuple(TYPES)):
    """Return ({id: listing}, report). Splits by category, then grade, then type to stay under QUERY_CAP."""
    _, overall = client.page(1)
    expected = sum(overall.values())
    found = {}

    def collect(main, sub=None, grade=None):
        for page in range(1, QUERY_CAP // PAGE_SIZE + 1):
            rows, _ = client.page(page, main, sub, grade)
            for row in rows:
                entry = listing(row)
                if entry:
                    found[entry['id']] = entry
            if len(rows) < PAGE_SIZE:
                return

    for main in mains:
        _, grades = client.page(1, main)
        if sum(grades.values()) <= QUERY_CAP:
            if grades:
                collect(main)
            continue
        oversized = sorted(grade for grade, count in grades.items() if count > QUERY_CAP)
        for grade in sorted(grades):
            if grades[grade] and grade not in oversized:
                collect(main, grade=grade)
        for sub in subs if oversized else ():
            _, sub_grades = client.page(1, main, sub)
            for grade in oversized:
                if sub_grades.get(grade):
                    collect(main, sub, grade)
    report = {'expected': expected, 'collected': len(found), 'requests': client.requests}
    if not expected or len(found) < expected * MIN_COVERAGE:
        raise SourceError(f'Item list incomplete: {len(found)} of {expected}')
    return found, report
```

- [ ] **Step 4: Run and confirm the tests pass**

Run: `python -B -m unittest discover -s tests -p "test_item_catalog.py" -q`
Expected: `OK` (16 tests).

---

### Task 8: Shards and record validation (`item_catalog.py`, part 3)

**Files:**
- Modify: `exalted/item_catalog.py` (append)
- Test: `tests/test_item_catalog.py` (append)

- [ ] **Step 1: Append the failing tests**

```python
class ShardTests(unittest.TestCase):
    def test_hundred_deterministic_shards_by_last_two_digits(self):
        potion = {'id': '530116010', 'name': 'Serum', 'grade': 'Common', 'rarity': 'common', 'type': 'Potion',
                  'category': 'Usable'}
        shards = catalog.build_shards([LUDRA_RECORD, potion])
        self.assertEqual(len(shards), 100)
        self.assertEqual(sorted(shards)[0], 'items/00.json')
        self.assertEqual(json.loads(shards['items/03.json'])['items']['110120003'], LUDRA_RECORD)
        self.assertEqual(json.loads(shards['items/10.json'])['items'], {'530116010': potion})
        self.assertEqual(json.loads(shards['items/42.json']), {'version': 1, 'items': {}})
        self.assertEqual(shards, catalog.build_shards([potion, LUDRA_RECORD]))
        self.assertTrue(shards['items/03.json'].endswith(b'\n'))

    def test_invalid_records_never_reach_a_shard(self):
        for bad in [{**LUDRA_RECORD, 'rarity': 'gold'}, {**LUDRA_RECORD, 'icon': 'https://evil.example/a.png'},
                    {**LUDRA_RECORD, 'extra': 1}, {**LUDRA_RECORD, 'name': ''}, {**LUDRA_RECORD, 'itemLevel': '1'},
                    {**LUDRA_RECORD, 'stats': []}, {**LUDRA_RECORD, 'randomStats': {'picks': 3}}]:
            with self.assertRaises(ValueError):
                catalog.build_shards([bad])
        with self.assertRaises(ValueError):
            catalog.build_shards([LUDRA_RECORD, LUDRA_RECORD])
```

- [ ] **Step 2: Run and confirm failure**

Run: `python -B -m unittest discover -s tests -p "test_item_catalog.py" -q`
Expected: `AttributeError: ... has no attribute 'build_shards'`.

- [ ] **Step 3: Append shards and validation**

These rules mirror `item-data.js` in the website repository. Keep the two in step.

```python
FIELDS = {'id', 'name', 'grade', 'rarity', 'type', 'category', 'icon', 'itemLevel', 'requiredLevel', 'stats',
          'randomStats', 'sellPrice'}
REQUIRED = {'id', 'name', 'grade', 'rarity', 'type', 'category'}
SHARD_LIMIT = 1024 * 1024


def _text(value, limit):
    if not isinstance(value, str) or not value.strip() or len(value) > limit or CONTROL.search(value):
        raise ValueError('Invalid item text')


def _stats(value):
    if not isinstance(value, list) or not 0 < len(value) <= 60:
        raise ValueError('Invalid item stats')
    for stat in value:
        if not isinstance(stat, dict) or set(stat) != {'label', 'value'}:
            raise ValueError('Invalid item stat')
        _text(stat['label'], 80)
        _text(stat['value'], 80)


def validate_record(record):
    if not isinstance(record, dict) or not REQUIRED <= set(record) or set(record) - FIELDS:
        raise ValueError('Invalid item record fields')
    if not ID.fullmatch(str(record['id'])) or not isinstance(record['id'], str):
        raise ValueError('Invalid item ID')
    if record['rarity'] not in RARITIES:
        raise ValueError('Invalid item rarity')
    for key, limit in (('name', 200), ('grade', 40), ('type', 80), ('category', 80)):
        _text(record[key], limit)
    if 'icon' in record and not (isinstance(record['icon'], str) and record['icon'].startswith(ICON_BASE)
                                 and re.fullmatch(r'[A-Za-z0-9_-]+\.png', record['icon'][len(ICON_BASE):])):
        raise ValueError('Invalid item icon')
    for key in ('itemLevel', 'requiredLevel', 'sellPrice'):
        if key in record and _whole(record[key]) is None:
            raise ValueError('Invalid item number')
    if 'stats' in record:
        _stats(record['stats'])
    if 'randomStats' in record:
        random = record['randomStats']
        if not isinstance(random, dict) or set(random) != {'picks', 'stats'} or _whole(random['picks']) is None:
            raise ValueError('Invalid random stats')
        _stats(random['stats'])


def shard_name(item_id):
    return f'items/{item_id[-2:].zfill(2)}.json'


def build_shards(records):
    """Return {path: bytes} for all 100 shards. Sorted keys keep unchanged data byte-identical."""
    shards = {f'items/{number:02d}.json': {} for number in range(100)}
    for record in records:
        validate_record(record)
        items = shards[shard_name(record['id'])]
        if record['id'] in items:
            raise ValueError('Duplicate item ID')
        items[record['id']] = record
    output = {}
    for path, items in shards.items():
        data = (json.dumps({'version': 1, 'items': items}, ensure_ascii=False, sort_keys=True,
                           separators=(',', ':')) + '\n').encode('utf-8')
        if len(data) > SHARD_LIMIT:
            raise ValueError('Item shard is too large')
        output[path] = data
    return output
```

- [ ] **Step 4: Run and confirm the tests pass**

Run: `python -B -m unittest discover -s tests -p "test_item_catalog.py" -q`
Expected: `OK` (18 tests).

---

### Task 9: Details cache, rotation and guards (`exalted/item_sync.py`, part 1)

**Files:**
- Create: `exalted/item_sync.py`
- Test: `tests/test_item_sync.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_item_sync.py`:

```python
import json
import sqlite3
import subprocess
import tempfile
import unittest
from contextlib import closing
from datetime import date
from pathlib import Path
from unittest.mock import patch

from exalted import item_catalog as catalog
from exalted import item_sync as sync
from test_item_catalog import FakeQuestlog, make_rows

DAY = date(2026, 10, 11)


class TempCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'data').mkdir()

    def cache(self):
        cache = sync.DetailCache(self.root / 'data/item-details.sqlite3')
        self.addCleanup(cache.close)
        return cache

    def listings(self, rows):
        return {entry['id']: entry for entry in map(catalog.listing, rows)}


class RefreshTests(TempCase):
    def test_new_items_fetched_then_only_a_rotating_seventh(self):
        rows = make_rows([('weapon', 'sword', 41, 70)])
        listings, client, cache = self.listings(rows), FakeQuestlog(rows), self.cache()
        self.assertEqual(sync.refresh(client, listings, cache, DAY), {'attempted': 70, 'failed': 0})
        client.detail_calls.clear()
        report = sync.refresh(client, listings, cache, DAY)
        self.assertEqual(report['attempted'], 10)
        self.assertTrue(all(sync.due(item_id, DAY) for item_id in client.detail_calls))

    def test_failed_refresh_keeps_last_details_and_new_items_come_first(self):
        rows = make_rows([('weapon', 'sword', 41, 30)])
        listings, cache = self.listings(rows), self.cache()
        sync.refresh(FakeQuestlog(rows), listings, cache, DAY)
        target = next(item_id for item_id in listings if sync.due(item_id, DAY))
        sync.refresh(FakeQuestlog(rows, fail_details=[target]), listings, cache, DAY)
        self.assertEqual(cache.get(target)['sellPrice'], 10)
        newer = make_rows([('weapon', 'sword', 41, 33)])
        client = FakeQuestlog(newer)
        sync.refresh(client, self.listings(newer), cache, DAY, limit=3)
        self.assertEqual(client.detail_calls, sorted(set(self.listings(newer)) - set(listings)))

    def test_many_detail_failures_stop_early(self):
        rows = make_rows([('weapon', 'sword', 41, 200)])
        client = FakeQuestlog(rows, fail_details=[row['id'] for row in rows])
        with self.assertRaisesRegex(sync.SyncError, 'detail failures'):
            sync.refresh(client, self.listings(rows), self.cache(), DAY)
        self.assertEqual(len(client.detail_calls), 20)


class BuildTests(TempCase):
    def test_records_use_cached_details_when_present(self):
        rows = make_rows([('weapon', 'sword', 41, 2)])
        listings, cache = self.listings(rows), self.cache()
        first = sorted(listings)[0]
        cache.put(first, catalog.detail_subset({'isSellable': True, 'sellPrice': 99, 'minLevelRequirement': 9}), DAY)
        records, unknown = sync.build_records(listings, cache)
        self.assertEqual([r.get('sellPrice') for r in records], [99, None])
        self.assertEqual(unknown, [])

    def test_count_guard(self):
        sync.check_count(None, 10)
        sync.check_count(1000, 951)
        with self.assertRaisesRegex(sync.SyncError, 'fell'):
            sync.check_count(1000, 949)
```

- [ ] **Step 2: Run and confirm failure**

Run: `python -B -m unittest discover -s tests -p "test_item_sync.py" -q`
Expected: `ModuleNotFoundError: No module named 'exalted.item_sync'`.

- [ ] **Step 3: Create `exalted/item_sync.py` with the cache, rotation and guards**

```python
"""Daily AION 2 item snapshot: questlog -> website shards (git push) -> bot autocomplete index."""
import argparse
import json
import os
import re
import sqlite3
import subprocess
import tempfile
import time
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from . import item_catalog as catalog

ROOT = Path('/home/kcam/bots/exalted')
REMOTE = 'git@github.com:kcam01/Aion2.git'
SHARD = re.compile(r'items/\d\d\.json')
MAX_DROP = 0.05            # publish nothing if the catalog shrinks by more than this
MAX_DETAIL_FAILURES = 0.2  # stop fetching details once this share of attempts has failed (after 20 attempts)


class SyncError(RuntimeError):
    pass


class DetailCache:
    """The job's private cache of detail_subset() results; kept even when a run does not publish."""

    def __init__(self, path):
        self.db = sqlite3.connect(path, timeout=10)
        self.db.execute('CREATE TABLE IF NOT EXISTS details '
                        '(id TEXT PRIMARY KEY, detail TEXT NOT NULL, fetched_on TEXT NOT NULL)')
        self.db.commit()

    def get(self, item_id):
        row = self.db.execute('SELECT detail FROM details WHERE id = ?', (item_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def ids(self):
        return {row[0] for row in self.db.execute('SELECT id FROM details')}

    def put(self, item_id, detail, day):
        self.db.execute('INSERT OR REPLACE INTO details VALUES (?, ?, ?)',
                        (item_id, json.dumps(detail, separators=(',', ':')), day.isoformat()))

    def commit(self):
        self.db.commit()

    def close(self):
        self.db.close()


def due(item_id, day):
    return int(item_id) % 7 == day.toordinal() % 7


def refresh(client, listings, cache, day, limit=None):
    """Fetch details for new items, then the seventh of known items due today."""
    known = cache.ids()
    todo = sorted((item_id for item_id in listings if item_id not in known or due(item_id, day)),
                  key=lambda item_id: (item_id in known, item_id))
    if limit is not None:
        todo = todo[:limit]
    failed = 0
    try:
        for count, item_id in enumerate(todo, 1):
            try:
                cache.put(item_id, catalog.detail_subset(client.item(item_id)), day)
            except (catalog.SourceError, ValueError):
                failed += 1
                if count >= 20 and failed > count * MAX_DETAIL_FAILURES:
                    raise SyncError(f'Too many item detail failures: {failed} of {count}') from None
            if count % 50 == 0:
                cache.commit()
    finally:
        cache.commit()
    return {'attempted': len(todo), 'failed': failed}


def build_records(listings, cache):
    unknown = set()
    records = [catalog.trim(listings[item_id], cache.get(item_id), unknown) for item_id in sorted(listings)]
    return records, sorted(unknown)


def check_count(previous, current):
    if previous and current < previous * (1 - MAX_DROP):
        raise SyncError(f'Item count fell from {previous} to {current}')
```

- [ ] **Step 4: Run and confirm the tests pass**

Run: `python -B -m unittest discover -s tests -p "test_item_sync.py" -q`
Expected: `OK` (5 tests).

---

### Task 10: Publishing shards (`item_sync.py`, part 2)

**Files:**
- Modify: `exalted/item_sync.py` (append)
- Test: `tests/test_item_sync.py` (append)

This follows the existing gallery publisher (`scripts/gallery/gallery_publish.py` in the website repo): a private bare repository, a temporary index, a path guard and a normal push. A concurrent website commit makes the push fail rather than be overwritten. `run()` (Task 11) retries from a fresh fetch.

- [ ] **Step 1: Append the failing test**

```python
def git(*args):
    return subprocess.check_output(['git', *map(str, args)], text=True, stderr=subprocess.DEVNULL).strip()


class PublishTests(TempCase):
    def origin(self):
        origin, seed = self.root / 'origin.git', self.root / 'seed'
        git('init', '--bare', origin)
        git('init', seed)
        git('-C', seed, 'checkout', '-b', 'main')
        (seed / 'index.html').write_text('Preserve unrelated website content')
        git('-C', seed, 'add', '.')
        git('-C', seed, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'Initial')
        git('-C', seed, 'push', origin, 'main')
        return origin, seed

    def test_publishes_only_item_shards_and_skips_unchanged_runs(self):
        origin, seed = self.origin()
        repo = self.root / 'data/item-sync.git'
        shards = catalog.build_shards([])
        first = sync.publish_shards(repo, str(origin), shards)
        self.assertTrue(first['changed'])
        self.assertEqual(first['files'], 100)
        self.assertEqual(git('--git-dir', origin, 'show', 'main:index.html'), 'Preserve unrelated website content')
        again = sync.publish_shards(repo, str(origin), shards)
        self.assertEqual((again['changed'], again['commit']), (False, first['commit']))
        record = {'id': '110120003', 'name': 'Blade', 'grade': 'Unique', 'rarity': 'unique', 'type': 'Sword',
                  'category': 'Weapons'}
        changed = sync.publish_shards(repo, str(origin), catalog.build_shards([record]))
        self.assertEqual(git('--git-dir', origin, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'main'),
                         'items/03.json')
        self.assertEqual(changed['files'], 1)

        def intervening_commit():
            git('-C', seed, 'pull', '--ff-only', origin, 'main')
            (seed / 'index.html').write_text('New user website change')
            git('-C', seed, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-am', 'Concurrent')
            git('-C', seed, 'push', origin, 'main')
        with self.assertRaisesRegex(RuntimeError, 'push failed'):
            sync.publish_shards(repo, str(origin), catalog.build_shards([]), before_push=intervening_commit)
        self.assertEqual(git('--git-dir', origin, 'show', 'main:index.html'), 'New user website change')

    def test_rejects_incomplete_shard_sets_and_foreign_files(self):
        origin, seed = self.origin()
        repo = self.root / 'data/item-sync.git'
        with self.assertRaises(ValueError):
            sync.publish_shards(repo, str(origin), {'items/00.json': b'{}'})
        (seed / 'items').mkdir()
        (seed / 'items/notes.txt').write_text('unexpected')
        git('-C', seed, 'add', '.')
        git('-C', seed, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'Foreign')
        git('-C', seed, 'push', origin, 'main')
        with self.assertRaisesRegex(ValueError, 'Unexpected file'):
            sync.publish_shards(repo, str(origin), catalog.build_shards([]))
```

- [ ] **Step 2: Run and confirm failure**

Run: `python -B -m unittest discover -s tests -p "test_item_sync.py" -q`
Expected: `AttributeError: module 'exalted.item_sync' has no attribute 'publish_shards'`.

- [ ] **Step 3: Append `publish_shards`**

```python
GIT_ENV = {'GIT_TERMINAL_PROMPT': '0', 'GIT_AUTHOR_NAME': 'kcam01',
           'GIT_AUTHOR_EMAIL': '17442074+kcam01@users.noreply.github.com', 'GIT_COMMITTER_NAME': 'kcam01',
           'GIT_COMMITTER_EMAIL': '17442074+kcam01@users.noreply.github.com'}
ALL_SHARDS = {f'items/{number:02d}.json' for number in range(100)}


def publish_shards(repo, remote, shards, before_push=None):
    """Commit the 100 shards on top of the latest main and push normally. Touches nothing outside items/."""
    if set(shards) != ALL_SHARDS:
        raise ValueError('Publication must contain exactly the 100 item shards')
    repo = Path(repo)
    repo.parent.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, **GIT_ENV}

    def git(*args, data=None, extra=None):
        result = subprocess.run(['git', '-c', 'core.hooksPath=/dev/null', '--git-dir', str(repo), *args],
                                input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120,
                                env={**env, **(extra or {})})
        if result.returncode:
            raise RuntimeError(f'Git {args[0]} failed; next scheduled run will retry')
        return result.stdout.decode('utf-8').strip()

    if not repo.exists():
        subprocess.run(['git', 'init', '--bare', str(repo)], check=True, capture_output=True, timeout=20)
        git('remote', 'add', 'origin', remote)
    if git('rev-parse', '--is-bare-repository') != 'true' or git('remote', 'get-url', 'origin') != remote:
        raise ValueError('Unexpected item repository')
    git('fetch', '--no-tags', '--depth=1', 'origin', 'main')
    base = git('rev-parse', 'FETCH_HEAD')
    existing = git('ls-tree', '-r', '--name-only', base, '--', 'items').splitlines()
    if any(not SHARD.fullmatch(path) for path in existing):
        raise ValueError('Unexpected file in the items directory')
    with tempfile.TemporaryDirectory(prefix='item-index-', dir=repo.parent) as temp:
        index = {'GIT_INDEX_FILE': str(Path(temp) / 'index')}
        git('read-tree', base, extra=index)
        for path, data in sorted(shards.items()):
            blob = git('hash-object', '-w', '--stdin', data=data)
            git('update-index', '--add', '--cacheinfo', '100644', blob, path, extra=index)
        tree = git('write-tree', extra=index)
        if tree == git('rev-parse', base + '^{tree}'):
            return {'changed': False, 'commit': base, 'files': 0}
        commit = git('commit-tree', tree, '-p', base, data=b'Sync AION 2 item snapshot\n')
    changed = git('diff-tree', '--no-commit-id', '--name-only', '-r', base, commit).splitlines()
    if not changed or any(not SHARD.fullmatch(path) for path in changed):
        raise ValueError('Publication would change non-item files')
    if before_push:
        before_push()
    git('push', 'origin', commit + ':refs/heads/main')
    return {'changed': True, 'commit': commit, 'files': len(changed)}
```

- [ ] **Step 4: Run and confirm the tests pass**

Run: `python -B -m unittest discover -s tests -p "test_item_sync.py" -q`
Expected: `OK` (7 tests). Git must be on `PATH` (it is in Git Bash and on the host).

---

### Task 11: Bot index, run, CLI and health (`item_sync.py`, part 3)

**Files:**
- Modify: `exalted/item_sync.py` (append)
- Test: `tests/test_item_sync.py` (append)

- [ ] **Step 1: Append the failing tests**

```python
class RunTests(TempCase):
    ROWS = make_rows([('weapon', 'sword', 41, 30), ('usable', 'potion', 11, 20)])

    def test_index_is_replaced_atomically_and_readable(self):
        record = {'id': '110120003', 'name': "Ludra's  Blade", 'grade': 'Unique', 'rarity': 'unique',
                  'type': 'Greatsword', 'category': 'Weapons',
                  'stats': [{'label': f'S{i}', 'value': str(i)} for i in range(6)]}
        path = self.root / 'data/items.sqlite3'
        sync.write_index(path, [record], '2026-10-11')
        sync.write_index(path, [record], '2026-10-12')
        self.assertEqual(sync.read_index_meta(path), {'published_on': '2026-10-12', 'count': '1'})
        with closing(sqlite3.connect(path)) as db:
            folded, stats = db.execute('SELECT folded, stats FROM items').fetchone()
        self.assertEqual(folded, "ludra's blade")
        self.assertEqual(len(json.loads(stats)), 4)
        self.assertEqual([p.name for p in (self.root / 'data').iterdir()], ['items.sqlite3'])
        self.assertEqual(sync.read_index_meta(self.root / 'missing.sqlite3'), {})

    def test_dry_run_writes_shards_and_index_without_git(self):
        out = self.root / 'site'
        receipt = sync.run(self.root, FakeQuestlog(self.ROWS), DAY, out_dir=out)
        self.assertEqual(receipt['items'], 50)
        self.assertEqual(len(list((out / 'items').glob('*.json'))), 100)
        self.assertEqual(receipt['published_on'], '2026-10-11')
        self.assertFalse((self.root / 'data/item-sync.git').exists())
        self.assertEqual(sync.read_index_meta(self.root / 'data/items.sqlite3')['count'], '50')

    def test_publish_retries_a_rejected_push_and_keeps_the_last_publish_date(self):
        results = [RuntimeError('Git push failed'), {'changed': True, 'commit': 'a', 'files': 3},
                   {'changed': False, 'commit': 'a', 'files': 0}]

        def fake_publish(repo, remote, shards):
            result = results.pop(0)
            if isinstance(result, Exception):
                raise result
            return result
        with patch.object(sync, 'publish_shards', fake_publish):
            first = sync.run(self.root, FakeQuestlog(self.ROWS), DAY, sleep=lambda s: None)
            later = sync.run(self.root, FakeQuestlog(self.ROWS), date(2026, 10, 12), sleep=lambda s: None)
        self.assertEqual((first['published_on'], later['published_on']), ('2026-10-11', '2026-10-11'))

    def test_guards_leave_the_index_untouched(self):
        sync.write_index(self.root / 'data/items.sqlite3', [], '2026-10-01')
        with closing(sqlite3.connect(self.root / 'data/items.sqlite3')) as db:
            db.execute("UPDATE meta SET value = '500' WHERE key = 'count'")
            db.commit()
        with self.assertRaisesRegex(sync.SyncError, 'fell'):
            sync.run(self.root, FakeQuestlog(self.ROWS), DAY, out_dir=self.root / 'site')
        self.assertEqual(sync.read_index_meta(self.root / 'data/items.sqlite3')['published_on'], '2026-10-01')

    def test_main_records_health_for_success_and_failure(self):
        with patch.object(sync.catalog, 'Questlog', lambda: FakeQuestlog(self.ROWS)):
            sync.main(['--root', str(self.root), '--dry-run', str(self.root / 'site')])
        health = json.loads((self.root / 'data/item-sync-health.json').read_text())
        self.assertEqual((health['state'], health['items']), ('ready', 50))
        with patch.object(sync.catalog, 'Questlog', lambda: FakeQuestlog([])):
            with self.assertRaises(SystemExit):
                sync.main(['--root', str(self.root), '--dry-run', str(self.root / 'site')])
        health = json.loads((self.root / 'data/item-sync-health.json').read_text())
        self.assertEqual((health['state'], health['error']), ('error', 'SourceError'))
```

- [ ] **Step 2: Run and confirm failure**

Run: `python -B -m unittest discover -s tests -p "test_item_sync.py" -q`
Expected: `AttributeError: ... has no attribute 'write_index'`.

- [ ] **Step 3: Append the index writer, `run` and `main`**

```python
def read_index_meta(path):
    try:
        with closing(sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True, timeout=5)) as db:
            return dict(db.execute('SELECT key, value FROM meta').fetchall())
    except sqlite3.Error:
        return {}


def write_index(path, records, published_on):
    """Build the bot's autocomplete index in a temporary file, then atomically replace the old one."""
    path = Path(path)
    handle, temp = tempfile.mkstemp(prefix='items-', suffix='.tmp', dir=path.parent)
    os.close(handle)
    try:
        with closing(sqlite3.connect(temp)) as db:
            db.execute('CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL, folded TEXT NOT NULL, '
                       'type TEXT NOT NULL, grade TEXT NOT NULL, rarity TEXT NOT NULL, icon TEXT, '
                       'item_level INTEGER, required_level INTEGER, stats TEXT NOT NULL)')
            db.execute('CREATE INDEX items_folded ON items (folded)')
            db.execute('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
            db.executemany('INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
                (r['id'], r['name'], ' '.join(r['name'].casefold().split()), r['type'], r['grade'], r['rarity'],
                 r.get('icon'), r.get('itemLevel'), r.get('requiredLevel'),
                 json.dumps(r.get('stats', [])[:4], ensure_ascii=False)) for r in records])
            db.executemany('INSERT INTO meta VALUES (?, ?)',
                           [('published_on', published_on), ('count', str(len(records)))])
            db.commit()
        os.chmod(temp, 0o600)
        os.replace(temp, path)
    except BaseException:
        Path(temp).unlink(missing_ok=True)
        raise


def run(root, client, day, out_dir=None, max_details=None, remote=REMOTE, sleep=time.sleep):
    """One sync. With out_dir, shards are written there instead of being pushed (local previews)."""
    data = Path(root) / 'data'
    index_path = data / 'items.sqlite3'
    meta = read_index_meta(index_path)
    listings, crawl_report = catalog.crawl(client)
    check_count(int(meta['count']) if meta.get('count', '').isdigit() else None, len(listings))
    cache = DetailCache(data / 'item-details.sqlite3')
    try:
        details_report = refresh(client, listings, cache, day, max_details)
        records, unknown = build_records(listings, cache)
    finally:
        cache.close()
    shards = catalog.build_shards(records)
    if out_dir:
        for path, payload in shards.items():
            target = Path(out_dir) / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(payload)
        result, published_on = {'changed': None, 'commit': None, 'files': len(shards)}, day.isoformat()
    else:
        for attempt in range(3):
            try:
                result = publish_shards(data / 'item-sync.git', remote, shards)
                break
            except RuntimeError:
                if attempt == 2:
                    raise
                sleep(10)
        published_on = (day.isoformat() if result['changed'] or not meta.get('published_on')
                        else meta['published_on'])
    write_index(index_path, records, published_on)
    return {'items': len(records), 'published_on': published_on, 'publish': result, 'crawl': crawl_report,
            'details': details_report, 'unknown_labels': unknown}


def main(argv=None):
    parser = argparse.ArgumentParser(description='Publish the daily AION 2 item snapshot.')
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--dry-run', type=Path, metavar='DIR', help='write shards under DIR instead of pushing')
    parser.add_argument('--max-details', type=int, metavar='N', help='fetch at most N details (local previews)')
    args = parser.parse_args(argv)
    (args.root / 'data').mkdir(parents=True, exist_ok=True)
    health = args.root / 'data/item-sync-health.json'
    receipt = {'checked_at': datetime.now(timezone.utc).isoformat()}
    try:
        receipt.update(run(args.root, catalog.Questlog(), datetime.now(timezone.utc).date(),
                           out_dir=args.dry_run, max_details=args.max_details), state='ready')
    except Exception as exc:
        receipt.update(state='error', error=type(exc).__name__, detail=str(exc)[:300])
    temp = health.with_suffix('.tmp')
    temp.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    temp.replace(health)
    print(json.dumps({key: receipt.get(key) for key in ('state', 'items', 'published_on', 'error', 'detail')}))
    if receipt['state'] != 'ready':
        raise SystemExit(1)


if __name__ == '__main__':
    main()
```

- [ ] **Step 4: Run and confirm the tests pass**

Run: `python -B -m unittest discover -s tests -p "test_item_sync.py" -q`
Expected: `OK` (12 tests).

- [ ] **Step 5: Full bot suite**

Run: `python -B -m unittest discover -s tests -q`
Expected: `OK`. The count is the Task 1 baseline + 30.

---

### Task 12: `/item` command (`exalted/items_discord.py`) and bot wiring

**Files:**
- Create: `exalted/items_discord.py`
- Modify: `exalted/bot.py` (imports near line 27; `__init__` near line 126; `help_command` near line 475; `main` near line 500)
- Modify: `exalted/verify.py` (`commands_ready`, line 11-15)
- Modify: `tests/test_alts.py` (command list at line 396-397)
- Test: `tests/test_items_discord.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_items_discord.py`:

```python
import tempfile
import unittest
from pathlib import Path

from exalted import verify
from exalted.bot import ExaltedBot
from exalted.item_sync import write_index
from exalted.items_discord import ItemIndex, NOT_READY, choice_label, item_embed
from exalted.store import Store
from test_bot import CONFIG, interaction


def record(item_id, name, kind='Mace', grade='Unique', **extra):
    return {'id': item_id, 'name': name, 'grade': grade, 'rarity': grade.lower(), 'type': kind, 'category': 'Weapons',
            **extra}


ITEMS = [
    record('110730048', 'Spiritforged Mace', icon='https://assets.playnccdn.com/static-aion2-gamedata/resources/I.png',
           itemLevel=45, requiredLevel=45, stats=[{'label': f'Stat {i}', 'value': str(i)} for i in range(6)]),
    record('110000001', 'Mace'),
    record('110000002', 'Macebearer Ring', kind='Ring'),
    record('110000003', 'Grand Mace', grade='Legend'),
    record('110000004', 'Pomace Tonic', kind='Potion', grade='Common'),
    record('110000005', 'Twin Blade', kind='Sword'),
    record('110000006', 'Twin Blade', kind='Dagger'),
    record('110000007', '100% Kina Box', kind='Kina Box', grade='Common'),
]


class ItemCommandTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'items.sqlite3'
        write_index(self.path, ITEMS, '2026-10-11')
        self.store = Store(':memory:')
        self.bot = ExaltedBot(CONFIG, self.store)
        self.bot.items = ItemIndex(self.path)
        self.cmd = self.bot.tree.get_command('item', guild=self.bot.guild_ref)

    async def asyncTearDown(self):
        await self.bot.close()
        self.store.close()
        self.temp.cleanup()

    async def complete(self, text):
        return await self.cmd._params['item'].autocomplete(interaction(), text)

    async def test_autocomplete_ranks_prefix_then_word_then_substring(self):
        names = [choice.name.split(' · ')[0] for choice in await self.complete('mace')]
        self.assertEqual(names, ['Mace', 'Macebearer Ring', 'Grand Mace', 'Spiritforged Mace', 'Pomace Tonic'])
        self.assertEqual(await self.complete('   '), [])
        self.assertEqual([c.value for c in await self.complete('%')], ['110000007'])

    async def test_duplicate_names_are_told_apart_and_limits_hold(self):
        choices = await self.complete('twin')
        self.assertEqual([c.name for c in choices], ['Twin Blade · Sword · Unique', 'Twin Blade · Dagger · Unique'])
        long = record('1', 'X' * 150, kind='Y' * 20)
        self.assertEqual(len(choice_label({**long, 'type': long['type']})), 100)
        many = [record(str(200000000 + i), f'Shield {i:02}') for i in range(40)]
        write_index(self.path, many, '2026-10-11')
        self.assertEqual(len(await self.complete('shield')), 25)

    async def test_selected_item_posts_publicly_with_link_and_no_mentions(self):
        inter = interaction()
        await self.cmd.callback(inter, item='110730048')
        kwargs = inter.response.send_message.await_args.kwargs
        self.assertNotIn('ephemeral', kwargs)
        embed = kwargs['embed']
        self.assertEqual(embed.title, 'Spiritforged Mace')
        self.assertEqual(embed.url, 'https://exalted-aion2.vercel.app/item?id=110730048')
        self.assertEqual(embed.description, 'Unique · Mace · Item level 45 · Requires level 45')
        self.assertEqual(len(embed.fields), 4)
        self.assertEqual(embed.thumbnail.url, ITEMS[0]['icon'])
        self.assertEqual(embed.footer.text, 'Data: questlog.gg · updated 2026-10-11')
        self.assertEqual(kwargs['view'].children[0].url, 'https://exalted-aion2.vercel.app/item?id=110730048')
        self.assertFalse(kwargs['allowed_mentions'].everyone)

    async def test_typed_names_resolve_only_when_unique(self):
        inter = interaction()
        await self.cmd.callback(inter, item='  grand mace ')
        self.assertEqual(inter.response.send_message.await_args.kwargs['embed'].title, 'Grand Mace')
        with self.assertRaisesRegex(ValueError, 'Several items are named Twin Blade'):
            await self.cmd.callback(interaction(), item='Twin Blade')
        with self.assertRaisesRegex(ValueError, 'No item called Nope'):
            await self.cmd.callback(interaction(), item='Nope')

    async def test_missing_index_is_not_ready(self):
        self.bot.items = ItemIndex(Path(self.temp.name) / 'missing.sqlite3')
        self.assertEqual(await self.complete('mace'), [])
        with self.assertRaisesRegex(ValueError, NOT_READY):
            await self.cmd.callback(interaction(), item='110730048')
        self.assertFalse((Path(self.temp.name) / 'missing.sqlite3').exists())

    def test_embed_without_optional_fields(self):
        embed = item_embed({**ITEMS[1], 'icon': None, 'item_level': None, 'required_level': None, 'stats': []},
                           '2026-10-11')
        self.assertEqual(embed.description, 'Unique · Mace')
        self.assertEqual(len(embed.fields), 0)

    async def test_help_and_deployment_check_include_item(self):
        inter = interaction()
        await self.bot.tree.get_command('help', guild=self.bot.guild_ref).callback(inter)
        text = '\n'.join(call.kwargs.get('content', '') for call in inter.followup.send.call_args_list)
        self.assertIn('/item item:Name', text)
        names = ['link', 'profile', 'notifications', 'unlink', 'help', 'links', 'link-approve', 'link-reject',
                 'bot-status', 'linkalts', 'unlinkalt', 'item']
        self.assertTrue(verify.commands_ready({'commands': len(names), 'command_names': names}))
        self.assertFalse(verify.commands_ready({'commands': len(names) - 1, 'command_names': names[:-1]}))
```

- [ ] **Step 2: Run and confirm failure**

Run: `python -B -m unittest discover -s tests -p "test_items_discord.py" -q`
Expected: `ModuleNotFoundError: No module named 'exalted.items_discord'`.

- [ ] **Step 3: Create `exalted/items_discord.py`**

```python
"""Public /item lookups backed by the daily item snapshot index (data/items.sqlite3)."""
import json
import re
import sqlite3
from contextlib import closing
from pathlib import Path

import discord
from discord import app_commands

PAGE = 'https://exalted-aion2.vercel.app/item?id='
NOT_READY = "Item search isn't ready yet — try again later."
COLORS = {'common': 0xBFC1CE, 'rare': 0x91E959, 'legend': 0x89A5FF, 'unique': 0xC48CFF, 'epic': 0xC48CFF,
          'mythic': 0xE7C265, 'special': 0xE7C265}
COLUMNS = 'id, name, type, grade, rarity, icon, item_level, required_level, stats'


class IndexUnavailable(Exception):
    pass


def _fold(text):
    return ' '.join(text.casefold().split())


def _like(text):
    return re.sub(r'([\\%_])', r'\\\1', text)


class ItemIndex:
    """Read-only view; the sync job replaces the file atomically, so every query opens it fresh."""

    def __init__(self, path):
        self.path = Path(path)

    def _rows(self, sql, args=()):
        try:
            with closing(sqlite3.connect(self.path.resolve().as_uri() + '?mode=ro', uri=True, timeout=2)) as db:
                db.row_factory = sqlite3.Row
                rows = [dict(row) for row in db.execute(sql, args).fetchall()]
        except sqlite3.Error as exc:
            raise IndexUnavailable(NOT_READY) from exc
        for row in rows:
            if 'stats' in row:
                row['stats'] = json.loads(row['stats'])
            row.pop('rank', None)
        return rows

    def search(self, text, limit=25):
        folded = _fold(text)
        if not folded:
            return []
        pattern = _like(folded)
        return self._rows(
            f"SELECT {COLUMNS}, CASE WHEN folded LIKE ? ESCAPE '\\' THEN 0 WHEN folded LIKE ? ESCAPE '\\' THEN 1 "
            "ELSE 2 END AS rank FROM items WHERE folded LIKE ? ESCAPE '\\' ORDER BY rank, folded, id LIMIT ?",
            (pattern + '%', '% ' + pattern + '%', '%' + pattern + '%', limit))

    def get(self, item_id):
        rows = self._rows(f'SELECT {COLUMNS} FROM items WHERE id = ?', (item_id,))
        return rows[0] if rows else None

    def named(self, name):
        return self._rows(f'SELECT {COLUMNS} FROM items WHERE folded = ? ORDER BY id', (_fold(name),))

    def updated(self):
        rows = self._rows("SELECT value FROM meta WHERE key = 'published_on'")
        return rows[0]['value'] if rows else 'unknown'


def choice_label(row):
    suffix = f" · {row['type']} · {row['grade']}"
    name = row['name']
    if len(name) + len(suffix) > 100:
        name = name[:max(1, 99 - len(suffix))] + '…'
    return (name + suffix)[:100]


def resolve(index, value):
    value = value.strip()
    if re.fullmatch(r'\d{1,12}', value):
        row = index.get(value)
        if row:
            return row
    matches = index.named(value)
    if len(matches) == 1:
        return matches[0]
    if matches:
        raise ValueError(f'Several items are named {value[:100]} — pick one from the suggestions.')
    raise ValueError(f'No item called {value[:100]}.')


def item_embed(row, updated):
    facts = [row['grade'], row['type']]
    if row['item_level'] is not None:
        facts.append(f"Item level {row['item_level']}")
    if row['required_level'] is not None:
        facts.append(f"Requires level {row['required_level']}")
    embed = discord.Embed(title=row['name'][:256], url=PAGE + row['id'], color=COLORS.get(row['rarity'], COLORS['common']),
                          description=discord.utils.escape_markdown(' · '.join(facts))[:4096])
    for stat in row['stats'][:4]:
        embed.add_field(name=stat['label'][:256], value=discord.utils.escape_markdown(stat['value'])[:1024])
    if row['icon']:
        embed.set_thumbnail(url=row['icon'])
    embed.set_footer(text=f'Data: questlog.gg · updated {updated}')
    return embed


def item_view(item_id):
    view = discord.ui.View(timeout=None)
    view.add_item(discord.ui.Button(label='View item', url=PAGE + item_id))
    return view


def install_item_commands(bot):
    @bot.tree.command(name='item', description='Share an AION 2 item with a link to its Exalted item page',
                      guild=bot.guild_ref)
    @app_commands.describe(item='Start typing an item name, then pick a match')
    @app_commands.checks.cooldown(1, 5.0, key=lambda i: i.user.id)
    async def item_command(interaction: discord.Interaction, item: str):
        try:
            row = resolve(bot.items, item)
            updated = bot.items.updated()
        except IndexUnavailable:
            raise ValueError(NOT_READY) from None
        await interaction.response.send_message(embed=item_embed(row, updated), view=item_view(row['id']),
                                                allowed_mentions=discord.AllowedMentions.none())

    @item_command.autocomplete('item')
    async def item_autocomplete(interaction: discord.Interaction, current: str):
        try:
            rows = bot.items.search(current)
        except IndexUnavailable:
            return []
        return [app_commands.Choice(name=choice_label(row), value=row['id']) for row in rows]
```

- [ ] **Step 4: Wire it into `exalted/bot.py`**

Add the import after `from .alt_links import install_alt_commands, link_pages`:

```python
from .items_discord import ItemIndex, install_item_commands
```

In `ExaltedBot.__init__`, replace

```python
        install_alt_commands(self, reply, safe_text)
```

with

```python
        install_alt_commands(self, reply, safe_text)
        self.items = ItemIndex(config.get('items_index_path', 'data/items.sqlite3'))
        install_item_commands(self)
```

In `help_command`, insert this line immediately before the `/server-status` reply:

```python
            await reply(interaction, '`/item item:Name` — share an AION 2 item in this channel. Start typing, pick a match, and the card links to its Exalted item page.')
```

In `main()`, after `config.setdefault('health_path', str(db_path.with_name('health.json')))`, add:

```python
    config.setdefault('items_index_path', str(db_path.with_name('items.sqlite3')))
```

- [ ] **Step 5: Require the command in `exalted/verify.py`**

In `commands_ready`, change the `required` set to:

```python
    required = {'link', 'linkalts', 'unlinkalt', 'profile', 'notifications', 'unlink',
                'help', 'links', 'link-approve', 'link-reject', 'bot-status', 'item'}
```

In `tests/test_alts.py`, `test_deployment_verification_requires_both_alt_commands`, add `'item'` to the `commands` list:

```python
        commands = ['link', 'profile', 'notifications', 'unlink', 'help', 'links',
                    'link-approve', 'link-reject', 'bot-status', 'linkalts', 'unlinkalt', 'item']
```

- [ ] **Step 6: Run the new tests, then the full suite**

```bash
python -B -m unittest discover -s tests -p "test_items_discord.py" -q
python -B -m unittest discover -s tests -q
```

Expected: both `OK`. The full count is the Task 1 baseline + 37.

---

### Task 13: Units, deploy script and documentation

**Files:**
- Create (bot dir): `exalted-item-sync.service`, `exalted-item-sync.timer`, `deploy-item-links.py`
- Modify (bot dir): `README.md`
- Create (website): `docs/items-maintenance.md`
- Modify (website): `README.md`

- [ ] **Step 1: Create `exalted-item-sync.service`** (bot dir)

```ini
[Unit]
Description=Publish the daily AION 2 item snapshot to the Exalted website and bot index
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=kcam
Group=kcam
WorkingDirectory=/home/kcam/bots/exalted
Environment="GIT_SSH_COMMAND=/usr/bin/ssh -i /home/kcam/.ssh/exalted-roster_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/home/kcam/.ssh/exalted-roster_known_hosts -o ConnectTimeout=10"
ExecStart=/home/kcam/bots/exalted/.venv/bin/python -B -m exalted.item_sync
TimeoutStartSec=6h
Nice=10
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/kcam/bots/exalted/data
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
```

- [ ] **Step 2: Create `exalted-item-sync.timer`** (bot dir)

```ini
[Unit]
Description=Run the AION 2 item snapshot daily at 10:00 UTC

[Timer]
OnCalendar=*-*-* 10:00:00 UTC
Persistent=true
RandomizedDelaySec=300
Unit=exalted-item-sync.service

[Install]
WantedBy=timers.target
```

- [ ] **Step 3: Create `deploy-item-links.py`** (bot dir)

It runs **on the host** from an extracted release directory. Phase `sync` installs only the job, which the bot does not import. Phase `bot` swaps the bot code, restarts the bot and verifies it, and rolls back automatically on failure.

```python
"""Install the item-links release on the bot host in two phases, with drift checks, backups and rollback."""
import hashlib
import json
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('/home/kcam/bots/exalted')
RELEASE = Path(__file__).resolve().parent
PYTHON = str(ROOT / '.venv/bin/python')
STAMP = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
SYNC_FILES = ['exalted/item_labels.py', 'exalted/item_catalog.py', 'exalted/item_sync.py',
              'tests/test_item_catalog.py', 'tests/test_item_sync.py']
BOT_FILES = ['exalted/items_discord.py', 'exalted/bot.py', 'exalted/verify.py', 'tests/test_items_discord.py',
             'tests/test_alts.py', 'README.md']
UNITS = ['exalted-item-sync.service', 'exalted-item-sync.timer']
EXPECTED = json.loads((RELEASE / 'expected-live.json').read_text())  # live hashes this release replaces (null = new)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def run(*args, **kwargs):
    return subprocess.run(list(args), check=True, **kwargs)


def check_drift(names):
    for name in names:
        assert sha(ROOT / name) == EXPECTED[name], 'Live file changed since the release was prepared: ' + name


def stage_tests():
    stage = ROOT / 'releases' / ('item-links-tests-' + STAMP)
    stage.mkdir(mode=0o700, parents=True)
    for directory in ('exalted', 'tests'):
        shutil.copytree(ROOT / directory, stage / directory, ignore=shutil.ignore_patterns('__pycache__'))
    for name in SYNC_FILES + BOT_FILES:
        if name.startswith(('exalted/', 'tests/')):
            shutil.copy2(RELEASE / name, stage / name)
    test = subprocess.run([PYTHON, '-B', '-m', 'unittest', 'discover', '-s', 'tests', '-q'], cwd=stage,
                          capture_output=True, text=True)
    (stage / 'tests.log').write_text(test.stdout + test.stderr)
    if test.returncode:
        raise SystemExit('Staged tests failed; see ' + str(stage / 'tests.log'))
    return test.stderr.strip().splitlines()[-3:]


def backup(names, label):
    target = ROOT / 'backups' / f'pre-item-links-{label}-{STAMP}'
    target.mkdir(mode=0o700, parents=True)
    existed = {}
    for name in names:
        existed[name] = (ROOT / name).exists()
        if existed[name]:
            (target / name).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, target / name)
    with sqlite3.connect(ROOT / 'data/exalted.sqlite3') as source, sqlite3.connect(target / 'exalted.sqlite3') as copy:
        source.backup(copy)
    return target, existed


def restore(target, existed):
    for name, was_there in existed.items():
        if was_there:
            shutil.copy2(target / name, ROOT / name)
        else:
            (ROOT / name).unlink(missing_ok=True)


def phase_sync():
    check_drift(SYNC_FILES)
    tests = stage_tests()
    target, existed = backup(SYNC_FILES, 'sync')
    try:
        for name in SYNC_FILES:
            shutil.copy2(RELEASE / name, ROOT / name)
        for unit in UNITS:
            run('sudo', '-n', 'install', '-m', '0644', str(RELEASE / unit), '/etc/systemd/system/' + unit)
        run('sudo', '-n', 'systemctl', 'daemon-reload')
        run('sudo', '-n', 'systemctl', 'enable', '--now', 'exalted-item-sync.timer')
    except BaseException:
        subprocess.run(['sudo', '-n', 'systemctl', 'disable', '--now', 'exalted-item-sync.timer'])
        for unit in UNITS:
            subprocess.run(['sudo', '-n', 'rm', '-f', '/etc/systemd/system/' + unit])
        subprocess.run(['sudo', '-n', 'systemctl', 'daemon-reload'])
        restore(target, existed)
        raise
    return {'phase': 'sync', 'backup': str(target), 'tests': tests,
            'hashes': {name: sha(ROOT / name) for name in SYNC_FILES}}


def phase_bot():
    check_drift(BOT_FILES)
    index = ROOT / 'data/items.sqlite3'
    with sqlite3.connect(index.as_uri() + '?mode=ro', uri=True) as db:
        count = int(db.execute("SELECT value FROM meta WHERE key = 'count'").fetchone()[0])
    assert count > 9000, f'Item index has only {count} items; finish the first sync first'
    tests = stage_tests()
    target, existed = backup(BOT_FILES, 'bot')
    with sqlite3.connect((ROOT / 'data/exalted.sqlite3').as_uri() + '?mode=ro', uri=True) as db:
        links = db.execute('SELECT COUNT(*) FROM links').fetchone()[0]
    run('sudo', '-n', 'systemctl', 'stop', 'exalted-bot.service')
    changed = False
    try:
        changed = True
        for name in BOT_FILES:
            shutil.copy2(RELEASE / name, ROOT / name)
        run('sudo', '-n', 'systemctl', 'start', 'exalted-bot.service')
        verified = run(PYTHON, '-m', 'exalted.verify', cwd=ROOT, capture_output=True, text=True)
        receipt = json.loads(verified.stdout)
        assert receipt['passed'] and receipt['database']['links'] == links, 'Verification failed'
        assert 'item' in receipt['health']['command_names'], '/item is not registered'
    except BaseException:
        if changed:
            subprocess.run(['sudo', '-n', 'systemctl', 'stop', 'exalted-bot.service'])
            restore(target, existed)
        subprocess.run(['sudo', '-n', 'systemctl', 'start', 'exalted-bot.service'])
        raise
    return {'phase': 'bot', 'backup': str(target), 'tests': tests, 'items_indexed': count,
            'commands': receipt['health']['command_names'], 'hashes': {name: sha(ROOT / name) for name in BOT_FILES}}


if __name__ == '__main__':
    phase = sys.argv[1] if len(sys.argv) == 2 else ''
    if phase not in ('sync', 'bot'):
        raise SystemExit('usage: deploy-item-links.py sync|bot')
    result = phase_sync() if phase == 'sync' else phase_bot()
    (ROOT / 'data' / f'item-links-{phase}-verification.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
```

- [ ] **Step 4: Update the bot `README.md`**

Add this row to the command table, after the `/server-status server` row:

```markdown
| `/item item` | Share an AION 2 item publicly: autocomplete by name, then post a card linking to its Exalted item page. |
```

Add this section after the `## Commands` section's table:

````markdown
## Item links

`/item` autocompletes from `data/items.sqlite3`, a read-only index that `exalted-item-sync.timer` replaces atomically once a day (10:00 UTC). The job crawls questlog.gg's public AION 2 item database. That list returns at most 1,000 rows per query, so the job splits by category, grade and type. It refreshes details for new items plus a rotating seventh of the catalog, writes `items/00.json` … `items/99.json` and pushes them to the website's `main` only when they change. It replaces the index only after that publish succeeds (or finds nothing to publish).

Nothing is published if questlog fails, the crawl reaches less than 99% of questlog's count, the catalog shrinks by more than 5%, or more than 20% of detail requests fail. Health: `data/item-sync-health.json` (`unknown_labels` lists stat, type or grade IDs to add to `exalted/item_labels.py`). Service: `exalted-item-sync.service`. Details cache: `data/item-details.sqlite3`. Publishing repository: `data/item-sync.git`, using the roster deploy key.

```sh
sudo systemctl start --no-block exalted-item-sync.service   # run now
sudo journalctl -u exalted-item-sync -n 50 --no-pager
cat /home/kcam/bots/exalted/data/item-sync-health.json
```
````

- [ ] **Step 5: Run the full bot suite once more**

Run: `python -B -m unittest discover -s tests -q`
Expected: `OK`.

- [ ] **Step 6: Create `docs/items-maintenance.md`** (website repo)

```markdown
# Item pages maintenance

`/item?id=<id>` renders one AION 2 item from `items/<last two digits of id>.json`. The Discord `/item` command and the character-sheet gear popup link here. PLAYNC equipment IDs are the same as questlog item IDs.

## Where the data comes from

The bot host's `exalted-item-sync.timer` runs daily at 10:00 UTC. It reads questlog.gg's public AION 2 database. That list caps every query at 1,000 rows, so the job splits by category, grade and type. Items with no type inside an oversized bucket cannot be reached (8 of 9,260 on 2026-10-11). The job also fetches details for new items and for a rotating seventh of the catalog, so each item is rechecked at least weekly.

It commits `Sync AION 2 item snapshot` to `main` only when a shard changed. The commit touches nothing outside `items/`. Do not edit shards by hand; the next run would overwrite them.

## What is published

Name, PLAYNC grade name, type, category, item level, required level (above 1), base stats, random stats with the roll count, and sell price (sellable items only). Icons point to PLAYNC's CDN. `item-data.js` rejects any other field, any other icon host, or malformed values. The bot's `item_catalog.validate_record` applies the same rules before publishing.

## When something looks wrong

- **Stale or missing items:** check `data/item-sync-health.json` on the bot host. `state: error` explains why nothing was published; the previous snapshot stays live.
- **A raw ID such as `mysterystat` instead of a label:** add it to `exalted/item_labels.py` (label and `flat`/`percent`/`hundredths`) and redeploy the sync phase. `unknown_labels` in the health file lists every such ID.
- **Grade names:** codes 11/21/31/41/71 match PLAYNC. 51 uses questlog's "Mythic" until PLAYNC data confirms its name.
```

- [ ] **Step 7: Add an "Item pages" section to the website `README.md`**

Insert after the `## Character gallery` section:

```markdown
## Item pages

`/item?id=<id>` shows an AION 2 item's grade, type, levels, base stats, random stat ranges and sell price, with a link to questlog.gg for full details. Discord's `/item` command and the character-sheet gear popup link here. The data lives in `items/00.json` … `items/99.json`. A daily job on the bot host writes them and pushes only when something changed. Grade names follow PLAYNC character sheets. See `docs/items-maintenance.md`.
```

- [ ] **Step 8: Commit the website docs**

```bash
cd /d/website/aion
git add README.md docs/items-maintenance.md
git -c user.name=kcam01 -c user.email=17442074+kcam01@users.noreply.github.com commit -m "Document item pages and the daily item snapshot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Local dry run and browser verification

**Files:** none in either repository. Everything goes in a temporary directory `$S`: the session scratchpad if there is one, otherwise any empty directory.

- [ ] **Step 1: Dry-run the sync against live questlog**

From `D:\website\aion\output\exalted-bot`:

```bash
S="<scratchpad or empty temp dir>"
mkdir -p "$S/dry-root" "$S/dry-site"
python -B -m exalted.item_sync --root "$S/dry-root" --dry-run "$S/dry-site" --max-details 1000
```

It takes about 25 minutes at one request per second, and prints one JSON line. Expected:
- `"state": "ready"`, and `"items"` between 9,200 and 9,400.
- `$S/dry-root/data/item-sync-health.json` shows `crawl.collected / crawl.expected` ≥ 0.99, `details.attempted` 1000 and `details.failed` 0.
- `unknown_labels` is empty, or lists only `grade:51`. For any other entry, add it to `item_labels.py` with the label questlog shows for that item and rerun the unit tests.

The lowest IDs include `110120003` (Ludra's Blade of Extinction) and `110730048` (Spiritforged Mace), so both get full details.

- [ ] **Step 2: Validate every shard with the browser validator**

Write `$S/check-shards.mjs`:

```js
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [site, repo] = process.argv.slice(2);
const { findItem } = await import(pathToFileURL(repo + '/item-data.js'));
let count = 0, sizes = [];
for (const file of readdirSync(site + '/items')) {
  const text = readFileSync(site + '/items/' + file, 'utf8');
  sizes.push(text.length);
  const shard = JSON.parse(text);
  for (const id of Object.keys(shard.items)) { findItem(shard, id); count++; }
}
console.log(JSON.stringify({ shards: sizes.length, items: count, largestKB: Math.round(Math.max(...sizes) / 1024) }));
```

Run: `node "$S/check-shards.mjs" "$S/dry-site" /d/website/aion`
Expected: `{"shards":100,"items":<same as step 1>,"largestKB":<under 200>}` and no exception.

- [ ] **Step 3: Serve the site with clean URLs**

Copy the website into the dry-run site, so `items/` sits next to the pages:

```bash
cd /d/website/aion && git ls-files | while read f; do mkdir -p "$S/dry-site/$(dirname "$f")"; cp "$f" "$S/dry-site/$f"; done
```

Write `$S/serve.mjs`. It maps `/item` → `item.html` like Vercel's `cleanUrls`, and forwards `/api/*` to production so character sheets load real gear:

```js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = process.argv[2], types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    const upstream = await fetch('https://exalted-aion2.vercel.app' + req.url);
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json' });
    return res.end(Buffer.from(await upstream.arrayBuffer()));
  }
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (!path || path === '.') path = 'index.html';
  if (!extname(path)) path += '.html';
  try { const body = await readFile(join(root, path)); res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end('Not found'); }
}).listen(4173, '127.0.0.1');
```

Add a `.claude/launch.json` entry named `item-preview` (`runtimeExecutable` `node`, `runtimeArgs` `["<$S>/serve.mjs", "<$S>/dry-site"]`, `port` 4173) and start it with `preview_start`.

- [ ] **Step 4: Check every page state**

Desktop width (default), then `resize_window` presets `mobile` (375px) and custom 320×700. For each URL, take a screenshot and read the page text:

| URL | Expected |
| --- | --- |
| `/item?id=110120003` | Name in purple (Unique), "Unique · Greatsword", Item level 102, Required level 45, Sell price 59,720 Kina, six base stats starting "Attack 446 ~ 604", "Each copy rolls 3 of these." with 16 ranges including "Combat Speed 11.2% – 13%", icon visible, questlog links point to `/db/item/110120003`. |
| `/item?id=530116010` | Superior Life Serum: grade and type only (details were outside the 1,000 limit); no empty sections. |
| `/item?id=999999999` | "This item isn't in the Exalted list yet…" and the header questlog link. |
| `/item?id=abc` and `/item` | "Choose an item from Discord's /item command or a character sheet." with no questlog link. |
| `/member?name=kcamyazimoto` → click the main-hand gear | Popup shows "View item →" linking to `/item?id=110730048`; following it shows Spiritforged Mace. |

Also check:
- No horizontal scrolling at 375px or 320px (`document.documentElement.scrollWidth <= innerWidth`).
- Long stat labels wrap inside their rows.
- Keyboard focus is visible on the header link, the Retry button and "Full details".
- The browser console shows no errors.
- Blocking `assets.playnccdn.com` (or editing an icon URL in DevTools) shows the initial letter instead of a broken image.
- To check Retry: temporarily rename `$S/dry-site/items/03.json` and reload `/item?id=110120003`. The page should show "Item details are unavailable right now." with Retry; restore the file and click Retry to recover.

Save screenshots to `D:\website\aion\output\item-links\` (desktop, 375px and 320px for the weapon page; one each for the other states). Reset with `resize_window` preset `desktop` when done.

- [ ] **Step 5: Fix and re-verify**

If any check fails, fix the website files, rerun `node --test tests/*.test.mjs`, re-copy the changed files into `$S/dry-site`, and repeat Step 4. Commit fixes with a descriptive message.

---

### Task 15: Deploy the sync job and run the first full build

> **Stop and ask the user before Step 3.** It changes the production bot host.

**Files:** creates `D:\website\aion\output\item-links\release\` (release staging, not committed).

- [ ] **Step 1: Assemble the release and expected live hashes**

From `D:\website\aion\output\exalted-bot`:

```bash
R=/d/website/aion/output/item-links/release && rm -rf "$R" && mkdir -p "$R/exalted" "$R/tests"
for f in exalted/item_labels.py exalted/item_catalog.py exalted/item_sync.py exalted/items_discord.py exalted/bot.py exalted/verify.py tests/test_item_catalog.py tests/test_item_sync.py tests/test_items_discord.py tests/test_alts.py README.md exalted-item-sync.service exalted-item-sync.timer deploy-item-links.py; do cp "$f" "$R/$f"; done
ssh -o BatchMode=yes oldcg 'cd /home/kcam/bots/exalted && python3 - <<"EOF"
import hashlib, json, pathlib
names = ["exalted/item_labels.py", "exalted/item_catalog.py", "exalted/item_sync.py", "tests/test_item_catalog.py", "tests/test_item_sync.py", "exalted/items_discord.py", "exalted/bot.py", "exalted/verify.py", "tests/test_items_discord.py", "tests/test_alts.py", "README.md"]
print(json.dumps({n: hashlib.sha256(pathlib.Path(n).read_bytes()).hexdigest() if pathlib.Path(n).exists() else None for n in names}, indent=2))
EOF' > "$R/expected-live.json"
cat "$R/expected-live.json"
```

Expected: the new files map to `null`. `exalted/bot.py` is `d0fc4225…`, `exalted/verify.py` is `880aed6e…`, `tests/test_alts.py` is `491f36fe…` and `README.md` is `de5445b7…`. If the host hashes differ from these, stop; the host changed since Task 1.

- [ ] **Step 2: Copy the release to the host**

```bash
cd /d/website/aion/output/item-links && tar -czf release-item-links.tar.gz -C release .
scp -o BatchMode=yes release-item-links.tar.gz oldcg:/home/kcam/bots/exalted/
ssh -o BatchMode=yes oldcg 'cd /home/kcam/bots/exalted && mkdir -p releases/item-links-20261011 && tar -xzf release-item-links.tar.gz -C releases/item-links-20261011 && ls releases/item-links-20261011'
```

- [ ] **Step 3: Phase `sync` (after the user approves)**

```bash
ssh -o BatchMode=yes oldcg 'cd /home/kcam/bots/exalted && .venv/bin/python -B releases/item-links-20261011/deploy-item-links.py sync'
```

Expected JSON: `"phase": "sync"`, a backup path, and a test summary ending in `OK`. Then check `ssh oldcg 'systemctl list-timers exalted-item-sync.timer --no-pager'`; the next run should be listed at 10:00 UTC.

- [ ] **Step 4: Start the first full build**

```bash
ssh -o BatchMode=yes oldcg 'sudo -n systemctl start --no-block exalted-item-sync.service && systemctl status exalted-item-sync.service --no-pager | head -5'
```

The first build fetches every item's details (~9,300 requests plus ~400 list requests at one per second, about 3 hours). Watch for completion with a background command, not polling sleeps:

```bash
ssh -o BatchMode=yes oldcg 'until [ "$(systemctl show -p ActiveState --value exalted-item-sync.service)" != activating ]; do sleep 60; done; cat /home/kcam/bots/exalted/data/item-sync-health.json'
```

Expected:
- `state` is `ready`, `items` is about 9,250, and `details.failed` is 0 or small.
- `publish.changed` is `true`, with a commit SHA.
- `unknown_labels` is empty or `["grade:51"]`. For any other entry: add the label, redeploy the sync phase (refresh `expected-live.json` first) and rerun.

Then confirm on GitHub: `git -C /d/website/aion fetch origin && git -C /d/website/aion show --stat origin/main | head -8` shows "Sync AION 2 item snapshot" with 100 `items/*.json` files.

---

### Task 16: Merge the website branch

> **Stop and ask the user before merging.** `main` deploys to the public site.

- [ ] **Step 1: Bring the branch up to date and rerun the tests**

```bash
cd /d/website/aion && git fetch origin && git merge --no-edit origin/main && node --test tests/*.test.mjs
```

Expected: a clean merge (the branch never touches `items/`) and all tests pass.

- [ ] **Step 2: Push and open a PR**

```bash
git push -u origin claude/item-links
gh pr create --base main --head claude/item-links --title "Add item pages and gear links for Discord /item" --body "$(cat <<'EOF'
Adds `/item?id=` pages backed by the daily `items/*.json` snapshot, and a "View item" link in the character-sheet gear popup. Spec: docs/superpowers/specs/2026-10-11-item-links-design.md. Plan: docs/superpowers/plans/2026-10-11-item-links.md.

Verified locally against a live dry-run snapshot on desktop, 375px and 320px.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Then follow the session's PR tooling (`get_status`, and `bind_pr` if needed). Do not enable auto-merge.

- [ ] **Step 3: After the user approves, merge and verify production**

Merge the PR (squash or merge commit, as the user prefers). Once Vercel deploys, open `https://exalted-aion2.vercel.app/item?id=110120003` and `https://exalted-aion2.vercel.app/member?name=kcamyazimoto` (gear popup → View item) in the browser pane. Repeat the Task 14 desktop and 375px checks against production.

---

### Task 17: Enable `/item` and verify in Discord

> **Stop and ask the user before Step 1** (restarts the production bot) **and before Step 3** (posts in a guild channel).

- [ ] **Step 1: Phase `bot`**

```bash
ssh -o BatchMode=yes oldcg 'cd /home/kcam/bots/exalted && .venv/bin/python -B releases/item-links-20261011/deploy-item-links.py bot'
```

Expected JSON: `"phase": "bot"`, `items_indexed` above 9,000, and `commands` including `item`. On any failure, the script restores the previous bot code and restarts it. Read its traceback, fix the problem locally, rebuild the release, and retry.

- [ ] **Step 2: Read back the registered command**

`commands` in the Step 1 output comes from the bot's own health file after Discord sync. Also confirm `ssh oldcg 'cat /home/kcam/bots/exalted/data/health.json'` shows `"state": "ready"` and `item` in `command_names`.

- [ ] **Step 3: One real post (after the user approves the channel)**

Ask the user to run `/item` in the channel they choose, type `ludra`, pick "Ludra's Blade of Extinction · Greatsword · Unique", and send. Or, if they prefer, post it yourself through the Discord UI they have open. Confirm:
- The card shows the purple edge, the icon, "Unique · Greatsword · Item level 102 · Requires level 45", four stats, and the footer date.
- The title and "View item" both open `https://exalted-aion2.vercel.app/item?id=110120003`.

Save a screenshot to `D:\website\aion\output\item-links\`.

- [ ] **Step 4: Reconcile and record**

- Copy the deployed files' hashes from both phase receipts (`data/item-links-sync-verification.json`, `data/item-links-bot-verification.json`) into `D:\website\aion\output\item-links\receipts.json`.
- Confirm the local bot copy matches them.
- Append a short "Rollout" note to this plan with dates, commit SHAs, test counts (bot and website), screenshots taken, and anything not exercised.
- Commit the plan update on `main` through a follow-up PR, or include it in the Task 16 PR if that PR is still open.

---

## Rollout (2026-10-11)

- **Tests:** bot 312 (275 existing + 37 new), locally and in the host's staged run for both phases. Website 95 (86 + 9).
- **Live dry run** (local, nothing published): 9,252 of 9,260 items, 364 list requests, 1,000 details with 0 failures. All 100 shards passed `item-data.js` (largest 95 KB). It caught one bug before release: empty list results carry `facetDistribution: {}`.
- **Browser:** desktop, 375px and 320px against the dry-run snapshot. Weapon, details-less potion, unknown ID, invalid ID, Retry, broken-icon fallback, keyboard focus, and the gear popup → item page.
- **Sync phase:** 18:54 UTC. Backup: `backups/pre-item-links-sync-20261011T185452Z`. The timer is enabled; the first scheduled run is 2026-10-12 10:00 UTC (+ up to 5 min).
- **First full build:** 18:56 UTC. 9,252 items, 9,252 details attempted, 2 failed (published as listing-only records, retried by rotation). `unknown_labels: ["grade:51"]`. Snapshot commit `7803345` (100 `items/*.json`, nothing else).
- **Website:** PR kcam01/Aion2#1 merged by kcam01 at 19:24 UTC (`fb817a6`), before the snapshot landed. Production was rechecked after `7803345`: `/item?id=110120003` on desktop and 375px, and the KcamYazimoto gear popup → `/item?id=110730048`.
- **Bot phase:** 21:41 UTC. Backup: `backups/pre-item-links-bot-20261011T214137Z`. `exalted.verify` passed with the link count unchanged; `item` is registered; health is `ready`.
- **Discord:** `/item` → "ludra" → "Ludra's Blade of Extinction · Greatsword · Unique", posted in #officer-chat. The card matched the spec (Unique colour, icon, levels, 4 stats, footer date, View item button). The title links to `/item?id=110120003`.
- **Receipts and screenshots:** `output/item-links/`. The local bot copy matches the deployed hashes.
- **Not exercised in production yet:** the first timer run and rotating refresh; a push retry after a concurrent website commit (unit tested); the "Several items are named…" and "not ready" replies (unit tested); the PLAYNC name for grade 51.
