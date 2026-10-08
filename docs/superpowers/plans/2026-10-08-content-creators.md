# Content creators implementation plan

**Goal:** Publish the guild creator directory with live streams and recurring channel synchronization.

**Architecture:** Static directory and page, public provider status endpoint, private Discord scanner and approved-character lookup, Codex heartbeat.

**Tech stack:** Existing HTML/CSS/ES modules, Node tests, Vercel, Discord REST, read-only SQLite over SSH.

- [x] Add failing tests for canonical social profiles, grouping/deduplication, provider evidence, stale responses and embed selection in `tests/creators.test.mjs`.
- [x] Implement shared contracts in `creator-directory.js`, provider parsing in `creator-status-data.js`, bounded status fetches in `api/creator-status.js`.
- [x] Implement `scripts/scan-creators.mjs` with private credentials/receipts, complete-channel scan, approved character lookup, change-only manifest write and deployed acknowledgement.
- [x] Add `creators.html`, `creators.css`, `creators.js` and navigation links; reuse the existing crest and background assets.
- [x] Populate from a fresh scan, run `node --test tests/*.test.mjs`, inspect desktop/mobile and live/offline/error/selection behavior using Playwright.
- [x] Reconcile origin/main, commit only scoped files, push ordinary main update, and verify production HTML/assets/directory/status.
- [x] Add maintenance documentation and a quiet 15-minute heartbeat; acknowledge the successful deployed scan.

## Verified rollout

Feature commit `71a106f` deployed successfully to Vercel. All 72 Node tests passed. Local browser checks covered search, two-stream selection, one muted player, preserving selection through refresh and failure recovery, offline/unknown states, and narrow-screen watch fallback. Production HTML, assets, directory and live endpoint matched the local implementation. Production layout checks passed at 320, 390, 768, 1024, 1440 and 1920 pixels with no page errors.

The initial channel scan found one account, FubukiShinko on Twitch, linked to approved character Fubuki. Twitch reported a live broadcast during implementation and offline at the final production check; actual live video playback was therefore not verified after deployment. Player behavior was checked with explicit local provider fixtures.

Heartbeat `exalted-content-creators` is active every 15 minutes on this chat. The deployed scan was acknowledged successfully. No Discord messages were sent.
