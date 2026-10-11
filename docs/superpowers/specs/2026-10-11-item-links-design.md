# Discord item links and item pages

Date: 2026-10-11
Status: Approved by the user on 2026-10-11, section by section. Chosen options: essentials-only item page, public `/item` replies, "View item" link in the character-sheet gear popup, daily snapshot published to the website repository.

## Requested behavior

Add a Discord `/item <item>` command with autocomplete. It posts the item in the channel and links to a new Exalted website page for that item.

## Data source

questlog.gg's public AION 2 database, which the site already uses for `/api/server-status`. No login or token is required.

- `database.getItems` (`https://questlog.gg/aion-2/api/trpc/database.getItems?input={"language":"en","page":N}`) lists 40 items per page, about 232 pages (~9,300 items). Each entry has `id`, `name`, `icon`, `grade`, `mainCategory`, `subCategory`, `createdAt` and `isDisabled`. The page size is fixed.
- `database.getItem` (`input={"language":"en","id":"<id>"}`) returns full details: `minLevelRequirement`, `sellPrice`, `equipmentInfo.itemLevel`, `equipmentInfo.soulbindRandomStatCount`, `itemStats.mainStats` and `itemStats.subStats` (each `id`, `minValue`, `maxValue`).
- Item IDs match PLAYNC's equipment `id` (for example, Spiritforged Mace is `110730048` in both).
- The icon path's final segment (e.g. `Icon_WP_GS_0108_T06`) exists on PLAYNC's CDN as `https://assets.playnccdn.com/static-aion2-gamedata/resources/<name>.png`. This was verified for weapon, currency box, reward box and enhancement-stone icons.
- questlog labels grade `41` as "Legend", while PLAYNC labels the same items "Unique". The snapshot uses PLAYNC's names so item pages match character sheets.
- questlog has no stat-name endpoint, so stat and category labels come from a mapping maintained in the bot source.

These contracts were checked against live responses on 2026-10-11. They are undocumented and may change.

## Item sync job (bot host)

A new job runs daily on the bot host under its own systemd service and timer, `exalted-item-sync.service` and `exalted-item-sync.timer` (`OnCalendar` 10:00 UTC, `Persistent=true`). It is separate from the bot process, like the roster sync. Its source lives in the bot package: `exalted/item_catalog.py` (questlog client, trimming, labels) and `exalted/item_sync.py` (job entry point, SQLite, shards, publishing).

1. **List crawl:** fetch every `database.getItems` page and skip `isDisabled` items.
2. **Detail fetch:** fetch `database.getItem` for new IDs and for a rotating seventh of the catalog (by `id mod 7` equal to the day number mod 7). Every item is refreshed at least weekly. If one item's details fail, it keeps its last stored details and is retried the next day. The first run fetches every item (about 2½ hours).
3. **Pacing:** about one request per second, an 8-second timeout per request, and a short backoff after an error. Requests send an honest User-Agent naming the Exalted item sync.
4. **Trim to essentials:** see the record format below. Stat and type labels come from one mapping in `item_catalog.py`. A stat ID without a label is published as its raw ID and listed in the job log. A type ID without a label is published title-cased and also logged. Every stat and type ID present on 2026-10-11 is mapped, and a test enforces this against recorded fixtures.
5. **Grade names:** a mapping from questlog grade codes to PLAYNC grade names, confirmed against PLAYNC equipment responses (`41` → `Unique`). A code that cannot be confirmed in PLAYNC data falls back to questlog's label and is logged. `rarity` is always one of the gear-card classes (`common`, `rare`, `legend`, `unique`, `epic`, `mythic`, `special`). A grade name outside that list uses `common`.
6. **Outputs**, both built from the same trimmed data:
   - Website shards `items/00.json` … `items/99.json`. An item's shard is the last two digits of its decimal ID (`110730048` → `items/48.json`). Keys are sorted and output is deterministic. Shards contain no timestamps, so unchanged data produces identical files.
   - An `items` table in the bot's SQLite database (id, name, type, grade, rarity, icon, item level, required level, first four base stats), plus the date of the last successful publish.
7. **Guards:** nothing is published if any list page fails, if the item count is more than 5% below the previous successful run, or if any shard fails validation. The last published snapshot stays live and the next run retries.
8. **Publish only on change:** reuse the roster sync's git publishing helper (`roster_sync.publish_roster`, generalized if needed) to commit `Sync AION 2 item snapshot` to `main` on `git@github.com:kcam01/Aion2.git`, which triggers Vercel. No commit is made when no shard changed. The bot's SQLite table is replaced only after the shards are published or found unchanged. Autocomplete therefore never offers an item the website snapshot lacks, apart from the few minutes a Vercel deployment takes.

### Shard record format

Example (stat values and sell price are illustrative):

```json
{
  "version": 1,
  "items": {
    "110730048": {
      "id": "110730048",
      "name": "Spiritforged Mace",
      "grade": "Unique",
      "rarity": "unique",
      "type": "Mace",
      "category": "Weapon",
      "icon": "https://assets.playnccdn.com/static-aion2-gamedata/resources/Icon_WP_MA_0078_T05.png",
      "itemLevel": 45,
      "requiredLevel": 45,
      "stats": [{"label": "Attack", "value": "160 ~ 206"}],
      "randomStats": {"picks": 3, "stats": [{"label": "Combat Speed", "value": "11.2% – 13%"}]},
      "sellPrice": 12345
    }
  }
}
```

`itemLevel`, `requiredLevel`, `stats`, `randomStats` and `sellPrice` are left out when the item has no such data. Values are formatted by the publisher. Percentage stats are stored in hundredths (`1298` → `13%`) and shown to at most one decimal place. Paired minimum/maximum attack stats are combined as `min ~ max`.

## Website item page

`/item?id=<digits>` uses new files `item.html`, `item.js`, `item.css` and `item-data.js`, the shared site header, `style.css` and `background.css`.

- `item.js` validates the `id` as 1–12 digits, loads its shard and finds the item.
- `item-data.js` validates shard records before rendering. It accepts only the fields above, numbers where numbers are expected, known rarity classes, and HTTPS icons on `assets.playnccdn.com`. All text is inserted with `textContent`. Tests use the same module.
- **Layout:**
  - A header with the icon in a rarity-coloured frame (the same rarity classes as gear cards), plus name, grade, type, item level and required level.
  - A base stats label/value list.
  - "Random stats — rolls N of these" with ranges.
  - Sell price in Kina.
  - "Full details on questlog.gg" linking to `https://questlog.gg/aion-2/en/db/item/<id>`, with source credit.
  - Empty sections are hidden. The document title is `<Item name> · Exalted`.
- **States:**
  - Invalid or missing ID: "Choose an item from Discord's /item command or a character sheet."
  - Unknown ID: "This item isn't in the Exalted list yet" with the questlog link.
  - Shard load failure: an unavailable message with a Retry button.
- Links pasted into Discord by hand show the site's generic preview. Per-item previews are out of scope.

### Character-sheet gear link

`character-sheet.js` keeps each gear piece's PLAYNC `id` when it is 1–12 digits. The existing gear popup in `app.js` adds a "View item" link to `/item?id=<id>` when an ID is present. Clicking a gear card still opens the popup.

## Discord `/item` command

New module `exalted/items_discord.py`, registered on the guild the same way as `alt_links.py`, available to every member.

- **Option:** `item`, a string with autocomplete.
- **Autocomplete:**
  - Case-insensitive search of the SQLite `items` table.
  - Results are ordered by name prefix match, then word-start match, then substring match, then name. At most 25 results are returned.
  - Each label is `Name · Type · Grade`, truncated to 100 characters. The value is the item ID.
  - Empty input returns no suggestions.
- **Resolving the submitted value:**
  - If it is an item ID in the table, that item is used.
  - Otherwise, an exact case-insensitive name match used by exactly one item is used.
  - If several items share the name: private reply "Several items are named X — pick one from the suggestions."
  - If nothing matches: private reply "No item called X."
- **Public reply:** an embed linking to `https://exalted-aion2.vercel.app/item?id=<id>`.
  - Title: the item name, linked to the page. Thumbnail: the icon. Colour: the grade.
  - One line: grade, type, item level and required level.
  - Up to four base stats.
  - A "View item" link button.
  - Footer: `Data: questlog.gg · updated <last publish date>`.
  - Allowed mentions are disabled.
- **Not ready:** when the table is empty or unreadable, private reply "Item search isn't ready yet — try again later." The bot keeps running.
- `/help` gains a line describing `/item`.

## Testing

- **Bot (`python -B -m unittest discover -s tests`):**
  - Trimming recorded questlog fixtures (weapon, armour, accessory, consumable, box).
  - Grade mapping and full stat/type label coverage.
  - Number formatting.
  - Shard placement and deterministic output, including no commit when nothing changed.
  - The partial-crawl and 5% count guards.
  - Rotating refresh selection and keeping the last details on failure.
  - Autocomplete ordering, label truncation, value resolution, and the private error and not-ready replies.
- **Website (`node --test tests/*.test.mjs`):**
  - `item-data.js` validation (bad ID, foreign icon host, missing or wrong-typed fields, unknown rarity).
  - Shard selection.
  - `character-sheet.js` keeping gear IDs.
  - The existing suite still passing. Also run `node --check` on the changed scripts.
- **Browser:**
  - The item page served locally with real snapshot shards.
  - Weapon, consumable, unknown-ID and invalid-ID cases, plus the gear popup link.
  - Desktop, 390px and 320px widths: layout, overflow, keyboard focus and image fallback.

## Rollout

1. Back up the bot source and SQLite on the host with SQLite's backup API, then run the full bot test suite there.
2. Install the item sync job and timer and run the first full build.
3. Merge the website branch (item page, gear link, shards) into `main` and confirm the Vercel deployment.
4. Enable `/item` and restart the bot, with automatic rollback on failure.
5. Read back the guild commands in Discord to confirm `/item` and its autocomplete. Post one real item.
6. Save receipts and screenshots under `output/item-links/`. Record bot and website test results in the plan.

## Out of scope

- An item search or browse page on the website.
- Per-item link previews.
- Enhancement tables, potential, decomposition and drop sources.
- Languages other than English.
- Linking items mentioned in ordinary chat messages.
