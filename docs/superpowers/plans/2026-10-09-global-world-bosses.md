# Global world boss timers

User scope: add the timers to the website. Reuse the existing emerald/gold cards and timezone control at `/events#world-bosses`.

- [x] Test the five Global Abyss recurrences against UTC, weekday rollover and Central DST. Use Aion2Hub's Global list checked October 9, 2026: Watcher Kaira every three hours from 01:00 GMT+9; Executors Argo/Kaira/Tamasa Monday/Thursday/Saturday 21:30 GMT+9; Abyss Siege Boss Friday/Sunday 21:00 GMT+9. No KR/TW-only bosses.
- [x] Create `world-boss-schedule.js` for the sourced catalog and validation of an Immortal Gartua kill record. Gartua is an estimated 12 hours after a reported Azphel kill, per AION2 Guide, not a recurring wall-clock timer. Reject malformed/future records. Keep elapsed records without automatically cycling.
- [x] Create `world-boss-timers.js` and add the section to `events.html`. Show five schedule cards plus Gartua, record a kill now or a past device-local date/time, clear a record, persist locally, and handle unavailable storage. Reuse the page tick and timezone selector. Show source links, estimate labels and device-only scope.
- [x] Run `node --test tests/*.test.mjs`, then browser checks for recording/reloading/clearing, future input, stale records, timezone changes, campaign links and storage failure. Visually inspect desktop/mobile screenshots before deployment.
- [ ] Review the scoped diff, commit only feature files, publish through the existing GitHub/Vercel workflow and verify deployed files plus live browser behavior.

Files: new `world-boss-schedule.js`, `world-boss-timers.js`, `tests/world-boss-schedule.test.mjs`; edit `timers.js`, `timers.css`, `events.html`, `docs/events-maintenance.md`. No Discord changes or official campaign timestamp changes.

Local validation: 77 Node tests passed; Edge/Playwright checks passed at 320, 390, 768, 1024, 1440 and 1920 pixels. Screenshots and browser receipts are private artifacts under `output/world-boss-timers/`.
