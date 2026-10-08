# Timers & Events

Add a guild-focused dashboard at `/events`, using Exalted's existing emerald/gold design and artwork. Keep official campaign data and its verification status separate from community recurring timers.

1. Test fixed GMT+9 recurrence math, active window boundaries, daily/weekly resets, local date rollover and DST conversions.
2. Build a dependency-free schedule module with source metadata, rifts, resets and Global field activities from Aion2Hub's October 8 reference.
3. Add accessible Game timers / Events & Drops tabs, timezone selection, category filters, a main rift countdown and upcoming openings. Preserve campaign deep links.
4. Check the full test suite, keyboard/tab behavior, timezone persistence, and desktop/mobile screenshots.
5. Commit only relevant files, deploy through the existing GitHub/Vercel workflow, and verify the live page.

Recurring times are community estimates derived from the reference's September 19 Global client data; display this limitation clearly. This change must not enable Discord alerts or mark official event sources freshly verified.
