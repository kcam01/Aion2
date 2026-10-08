# Content creators

Build `/creators` in the existing Exalted visual style. The source is only the guild's `#content-creators` channel. Group public account links by the sharing Discord member, and attach their approved main/alt character links using the bot's read-only database. Display names are public; numeric account IDs, messages, source IDs, credentials and approval records remain private.

The first section lists streams confirmed live by fresh provider evidence. Autoplay exactly one muted stream, allow switching, and retain the selected stream across refreshes. Show an honest empty or unavailable state. Twitch embeds use the current parent hostname, official controls, and minimum dimensions; narrow phones get a direct watch link. No historical Discord message is evidence of present live status.

Use a static `creators.json` directory and a bounded `/api/creator-status` function. Fetch only known directory accounts from fixed Twitch/YouTube hosts, with timeouts, strict parsing and short caches. Unsupported streaming providers remain links with unavailable status. Browser refreshes every minute and rejects stale responses. Public provider metadata is an integration that can change; unknown responses must fail closed rather than falsely assert live/offline.

A 15-minute Codex heartbeat scans the complete channel, detects edited/deleted/repeated links, resolves video links to their public creator channel where possible, and updates only meaningful directory changes. Identity resolution reads approved links on the bot host without changing bot settings or sending messages. Publish only after tests; acknowledge only after deployed data matches. A no-op stays quiet. Reuse existing artwork and fonts.

Alternatives considered: a manually maintained directory would drift; adding channel ingestion to the bot would require a separate bot rollout and publisher. The existing website heartbeat pattern plus a public status endpoint keeps this scoped to the website and avoids unnecessary bot changes.

Verification: URL normalization and hostile input, author grouping, approved character identity, edits/deletes and pagination failures; live/offline/unknown/stale parsing and endpoint failures; one-player selection; desktop/mobile screenshots, search, navigation, offline/error states; production bytes and live endpoint readback.
