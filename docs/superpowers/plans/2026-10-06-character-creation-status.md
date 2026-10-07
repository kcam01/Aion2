# Character creation status implementation

Goal: provide `/server-status` in Exalted and an Azphel character-creation panel beside the website joining instructions.

Use one public `/api/server-status` endpoint for both consumers. Read Questlog's public `serverStatus.getServerStatus` query, label it as a community source, and normalize only NA East servers. Azphel / Asmodian / 2106 is the default. Open requires valid integer tags with creation-lock bit 4 unset, a running server, no maintenance, matching server ID/name/faction/region, and a source timestamp no older than five minutes. Questlog's observed five-minute timestamps sometimes lead the response clock, so allow at most five minutes forward skew and label source time approximate. Preserve the raw source timestamp separately from request time. Unknown fields, inaccessible upstream, stale or excessively future timestamps, missing or duplicate identities must never become Open. Cache successful results for at most 20 seconds and no longer than their remaining freshness. Errors are not cached.

- [x] Add failing Node regression tests for source decoding, state mapping, timestamps, identity, and endpoint failure handling.
- [x] Implement the shared endpoint and homepage panel, refresh every 30 seconds and on return to the page, with a manual refresh and source link.
- [x] Add failing Python command tests, then implement a guild-scoped private `/server-status` response with optional NA East server selection and `/help` documentation.
- [x] Run existing Node and Python suites and review the website at desktop/mobile sizes.
- [x] Verify hosting access to the tracker in Vercel preview. Release through the website's main branch and the bot's backup/stage/test/restart procedure; check the live endpoint, registered command, and service health after release.

No automatic opening announcements are added by this feature. No Discord identities or bot state are exposed by the public endpoint.

Verification before release: 46 Node tests and 198 Python tests passed. Questlog's published client confirms tag bit 4 means character creation blocked. Both direct requests and the hosted Vercel preview confirmed Azphel open and Israphel blocked.

Source change: gaming.tools returned HTTP 403 to automated requests; the user selected Questlog as the alternative. The replacement uses the public JSON query already used by Questlog's own page, with no login, browser-challenge bypass or hard-coded status.
