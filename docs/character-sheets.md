# Exalted character sheets

`/member?name=<approved-roster-slug>` displays live PLAYNC data for any entry in `members.json`. The bot continues to maintain that roster; the redesign does not change link approval or roster publishing.

The page uses `member.html`, `style.css`, and `app.js`. Pure data normalization and browser-history validation live in `character-sheet.js`.

`character-family.js` renders the main's linked alt portraits between the identity/summary header and the detail tabs. Each portrait opens an independent character sheet. Alt sheets include the main and siblings with the current character marked. Empty families are hidden; missing portraits use initials. The roster validator accepts one level of public `alts` records, and API/profile lookup resolves these alongside mains. The guild homepage continues displaying/counting mains only. Members add alts automatically with `/linkalts character server` after their main is approved; `/unlinkalt character` removes one.

- Overview: compact identity header, combat power, item level, equipment ordered by slot, wings/pet, primary and divine attributes, Daevanion progress, and acquired-skill preview.
- Equipment: native hover descriptions and keyboard/touch-accessible inspection dialogs. Only supplied rarity, level, enchantment, and exceed values are shown.
- Daevanion: reported board counts and progress. The summary API does not include individual node selections.
- Skills: all reported skills, with category filters, equipped markers, acquisition state, and level requirements.
- Titles: displayed title and equipped title effects/counts. The upstream summary does not contain the entire unlocked collection.
- History: at most 20 changed observations of level, combat power, and item level, saved in local storage separately for each character identity. It is device-local, not an in-game activity feed. Blocked storage does not break the page.
- Compare: retrieves another approved member's profile and compares actual values. Missing values remain unknown. Unavailable rankings are omitted.

Refresh preserves previously loaded sections if PLAYNC temporarily fails. `#character-titles` remains supported alongside the new tab hashes. Tabs support arrow keys, Home, and End. Dialogs support Escape and return focus to their trigger.

Validation: `node --test tests/*.test.mjs`, `node --check app.js`, and `git diff --check`. Browser checks cover both current members, desktop/laptop/mobile layouts, item inspection, all tabs, skill filters, comparison, refresh, and missing-member/error states.

Publish only the source files, tests, and documentation. Keep private preview data, local screenshots, and server helpers under the untracked `output/` directory out of deployment.
