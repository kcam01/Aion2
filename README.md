# Exalted · AION 2

The `main` branch deploys automatically to https://kcamyazimoto-aion2.vercel.app.

The home page is the Exalted guild directory. Member pages:

- `/member?name=sarcodine` — Sarcodine, Zikel (`2102`).
- `/member?name=kcamyazimoto` — KcamYazimoto, Israphel (`2101`).

Both pages include live stats, gear images, skills, wings, and pets. The featured
directory is maintained in `members.js`; it is not an automatic guild roster.
The separate in-game guild field comes directly from PLAYNC.

Exalted uses the same gold winged E crest on the website, Discord server, and
guild bot. Browser-ready logo sizes are in `assets/exalted-crest-*.png`.

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
