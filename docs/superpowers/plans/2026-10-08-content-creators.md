# Content creators implementation plan

**Goal:** Publish the guild creator directory with live streams and recurring channel synchronization.

**Architecture:** Static directory and page, public provider status endpoint, private Discord scanner and approved-character lookup, Codex heartbeat.

**Tech stack:** Existing HTML/CSS/ES modules, Node tests, Vercel, Discord REST, read-only SQLite over SSH.

- [ ] Add failing tests for canonical social profiles, grouping/deduplication, provider evidence, stale responses and embed selection in `tests/creators.test.mjs`.
- [ ] Implement shared contracts in `creator-directory.js`, provider parsing in `creator-status-data.js`, bounded status fetches in `api/creator-status.js`.
- [ ] Implement `scripts/scan-creators.mjs` with private credentials/receipts, complete-channel scan, approved character lookup, change-only manifest write and deployed acknowledgement.
- [ ] Add `creators.html`, `creators.css`, `creators.js` and navigation links; reuse the existing crest and background assets.
- [ ] Populate from a fresh scan, run `node --test tests/*.test.mjs`, inspect desktop/mobile and live/offline/error/selection behavior using Playwright.
- [ ] Reconcile origin/main, commit only scoped files, push ordinary main update, and verify production HTML/assets/directory/status.
- [ ] Add maintenance documentation and a quiet 15-minute heartbeat; acknowledge the successful deployed scan.
