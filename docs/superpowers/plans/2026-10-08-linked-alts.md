# Linked Alts Implementation Plan

> For agentic workers: Use subagent-driven-development for the bot implementation and independent reviews. Steps below track the shared integration work.

**Goal:** Add automatically approved `/linkalts` requests and clickable alt portraits directly beneath the main character information on `/member`.

**Architecture:** Keep one main link per Discord account; attach alternates in an additive SQLite table. Publish automatically linked alts nested under each main in `members.json`. The site retains its main-only roster while profile lookup also resolves alts, and a dedicated character-family navigation module renders their portraits above the sheet tabs.

**Tech Stack:** Python 3.10, discord.py, SQLite, vanilla JavaScript modules, Node tests, Vercel.

## Task 1: Bot links and publisher

Files: `output/linked-alts-bot/exalted/alt_store.py`, `alt_links.py`, `store.py`, `bot.py`, `roster_sync.py`, `verify.py`; related tests and README in that bot directory.

- [x] Write and run failing persistence, invoker ownership, command, and publisher tests.
- [x] Add `alt_links` with unique character identity, parent foreign key/cascade, linked status, link timestamp and validated snapshot. Guard claims across main and alt tables inside `BEGIN IMMEDIATE` transactions.
- [x] Implement `/linkalts character server`, `/unlinkalt character`, automatic alt linking and linked-alt listing. Check the exact approved parent again after upstream awaits.
- [x] Preserve main approval/notification behavior; alt approval requires an approved main and never grants Recruit again. Test parent replacement, cross-account removal, and main unlink during approval.
- [x] Read main and alt rows in one read-only transaction. Publish only linked child identities under `main.alts`; preserve old roster format when empty and stable slugs across runs.
- [x] Run `python -B -m unittest discover -s tests` in the bot directory; inspect full-suite output and self-review changes. No production writes during this task.

## Task 2: Website data and character sheet

Files: `member-roster.js`, `members.js`, `character-family.js`, `app.js`, `member.html`, `style.css`, `tests/member-roster.test.mjs`, README/docs.

- [x] Write failing tests: nested alts resolve without changing main count; global slug/identity conflicts, private fields, malformed/nested arrays are rejected; alts resolve through the live API handler.
- [x] Update validation to accept optional `alts` only at the main level. Freeze validated arrays/records. Add `allCharacters(members)` and `findCharacterFamily(members, slug)`; make `findMember` resolve both mains and alts while keeping the existing default.
- [x] Render `<nav id="character-family" aria-labelledby="character-family-title" hidden>` between `.profile-header` and `#sheet`. Main view: Alts heading and alt portraits. Alt view: Characters heading, main link and siblings, with the current alt marked `aria-current="page"`.
- [x] Build DOM with textContent and validated URLs. Render initials behind images and hide failed images. Label each link with character, class/server and main/alt relationship. Wrap links on narrow screens and retain visible focus.
- [x] Use all approved characters for comparison. Document `/linkalts` and website placement. Run `node --test tests/*.test.mjs`, `node --check app.js`, and `git diff --check`.

## Task 3: Visual and integration verification

- [x] Serve the isolated source on localhost with real cached public profile responses and a separate fixture roster demonstrating multiple alts. Never publish fixture ownership claims.
- [x] Use browser tools at desktop and mobile widths to verify placement, portrait links, alt sheet data, return navigation, missing portrait fallback, keyboard focus, and overflow.
- [x] Run separate spec and code-quality reviews; address findings before release.

## Task 4: Release and verification

- [x] Commit only website source/tests/docs; fetch current main and preserve concurrent roster/website commits through rebase or merge. Deploy compatible site readers first and verify production assets.
- [x] Package bot source/tests and a deployment manifest. Compare deployed source hashes, back up source and SQLite using its backup API, run the complete server test suite in staging, then install and restart with rollback on failure.
- [x] Verify Discord command registration, current process health, database integrity/counts, read-only publisher result, roster sync timer, and the production character sheet.
- [x] Save receipts and screenshots under `output/`, reconcile local output source with the deployed release, and report exact command usage. Distinguish automated/fixture testing from any real player link not exercised.

## Completion evidence

Deployed on 2026-10-08. Website source commit: `7284c91`. All 63 website tests, 231 bot tests, and two deployment recovery tests passed. Desktop, 390px mobile, and 320px narrow layouts were checked; portrait navigation, fallback, keyboard focus, and overflow passed with local sample relationships. Discord readback confirmed `linkalts` and `unlinkalt` and their autocomplete options. Bot and roster timer are active; all 13 main profiles and snapshots were preserved. No real alt was linked as part of testing.

Receipts and screenshots are retained under `D:\website\aion\output\linked-alts\`. Current bot source is reconciled into `D:\website\aion\output\exalted-bot\`. The source/database rollback backup on the bot host is `/home/kcam/bots/exalted/backups/pre-linked-alts-20261008T185038Z`.
