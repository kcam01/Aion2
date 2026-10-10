# Exalted · AION 2

The `main` branch deploys automatically to https://exalted-aion2.vercel.app.

The joining instructions show character-creation availability for NA East / Asmodian / Azphel. The panel refreshes every 30 seconds, with a manual refresh control and source observation time. `/api/server-status` is also used by the Discord bot's `/server-status` command; its optional `server` query accepts the 16 NA East server IDs. The source is the third-party gaming.tools tracker. Online and character creation are separate states; only explicit, fresh creation permission is shown as Open. Data older than two minutes, missing fields, source errors and changed formats show unavailable. Successful responses are cached for at most 20 seconds, errors are not cached. The public status endpoint exposes no Discord or bot state.

Run the website regression suite with `node --test tests/*.test.mjs`.

The `/creators` page groups streams and social accounts shared in Discord
`#content-creators` by member and approved linked character. A 15-minute Codex
heartbeat scans additions, edits and removals; repeated links are deduplicated.
The live section checks Twitch/YouTube independently every minute while visible
and starts one muted stream on supported desktop browsers. Narrow Twitch layouts
offer a direct watch button. Failed/stale provider checks are shown as unavailable.
See `docs/creators-maintenance.md` for scanning, publication and provider limits.

The home page lists characters linked in Discord and approved by an officer. Member pages include:

- `/member?name=char-nae-2106-ad98f4dc135a131f566a` — Sarcodine, Assassin on Azphel (`2106`). The older `/member?name=sarcodine` link is an alias for this approved character.
- `/member?name=kcamyazimoto` — KcamYazimoto, Cleric on Azphel (`2106`).

Both pages include live stats, gear images, skills, wings, and pets. The featured
directory comes from `members.json`, which is maintained automatically from approved Discord links. A service on the bot host checks every minute and pushes only changed public character data to this repository, triggering Vercel. New members normally appear within a couple of minutes; unlinking removes their current roster entry. Pending requests never appear. Existing member URLs are preserved and new URLs use a stable character identity, so identical names on different servers work.

Only public character names, classes, server identities, portrait URLs and PLAYNC profile IDs are published. Discord account IDs, officer decisions and bot state stay on the bot host. Previously published public roster entries remain in Git history. If GitHub or Vercel is unavailable, the last deployed roster remains available and synchronization retries automatically. `members.js` validates the shared roster for both the browser and character API.
The separate in-game guild field comes directly from PLAYNC.

Members with an approved main can use `/linkalts character:YourAlt server:Azphel` in Discord. Alts are linked automatically after the bot validates the public character; no separate officer approval is needed. Use `/unlinkalt character` to remove an individual alt. A character can belong to only one main/account. Removing the main also removes its alt links.

The main character sheet displays linked alt portraits directly below its identity and headline stats, above the detail tabs. Click a portrait to open that alt's full sheet, with navigation back to the main and other alts. The row appears after the first alt is linked and roster synchronization deploys it. Alts have independent profile URLs and history, and are available for comparison; the guild roster still counts and displays mains only. `members.json` supports an optional `alts` array containing public character records under each main, without nested alt groups.

Exalted uses the same gold winged E crest on the website, Discord server, and
guild bot. Browser-ready logo sizes are in `assets/exalted-crest-*.png`.

The home, events, and character pages share an original AION 2-inspired Atreia
background generated with ChatGPT imagegen. `background.css` applies the artwork
with dark reading overlays and an opaque fallback. Desktop uses
`assets/atreia-background.webp` (177 KB); screens up to 760px load only the
portrait crop `assets/atreia-background-mobile.webp` (107 KB). The decoration
has no animation and cannot intercept clicks. Use ChatGPT imagegen for future
image generation and edits, as recorded in `AGENTS.md`.

Character Titles displays every entry returned in `info.title.titleList`, its
category, rarity, effects, and collection counts. The profile's displayed title
is shown separately and on the guild member card. PLAYNC's public response only
contains equipped title details, not the names of every unlocked title; owned
counts must not be presented as the number of named titles available to display.

The Vercel function at `/api/aion2?type=info&member=sarcodine` (or `type=equipment`)
loads the chosen public character. Omitting `member` preserves the original
KcamYazimoto default. Unknown members and data types are rejected before any
upstream call. PLAYNC Global requires `region=nae`
and `lang=en-US` on `/api/character/info` and `/api/character/equipment`.
Character search uses `https://api-search.plaync.com/aion2global/search/v2/character`
with `region=nae` and `localeInfo=en-US`; the supplied official profile ID remains
the fallback if search is unavailable. These contracts were verified against
the official site's character client and live responses on October 3, 2026.

Successful responses are cached for five minutes; errors are not cached. The
page displays the returned server, primary attributes, equipment and skill levels.

Run the endpoint regression tests with Node.js 24:

```sh
node --test tests/aion2.test.mjs
```

## Character gallery

The `/gallery` page displays AION 2 character images shared in Discord #general, with an images-only layout and full-size viewing. The existing Discord bot identity scans the channel every 15 minutes, uses only a free OpenRouter vision model to identify character images, deduplicates attachments, and publishes optimized WebP assets. See `docs/gallery-maintenance.md` for the importer, private credentials, safe publishing and retry behavior.
