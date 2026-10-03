# Linden Order guild landing page

Goal: Make the home page a Linden Order guild directory linking Sarcodine and KcamYazimoto to their own live character pages.

Architecture: Keep the existing static HTML/CSS/JavaScript and Vercel function. Share an explicit member directory between browser and API, with independent server IDs and verified official profile IDs. Preserve the existing KcamYazimoto API default.

Design: Forest green, aged gold, serif headings, official character portraits, responsive member cards. No invented guild achievements or automatic roster claims.

- [ ] Add endpoint regression tests for Sarcodine, fallback identity, and unknown members; run and confirm failures.
- [ ] Add shared member metadata and route each API request to the selected member.
- [ ] Move the detailed profile to `/member?name=...` and add guild navigation.
- [ ] Build the landing page with both member links and independently loaded live stats.
- [ ] Run `node --test tests/aion2.test.mjs`, check desktop/mobile layout, images, and both member routes.
- [ ] Commit, push main, and verify the Vercel production deployment and live API responses.
