# Sortable guild member directory

`/members` uses `members.html`, `member-directory.css`, `member-directory.js`, and the pure helpers in `member-directory-data.js`. Its flat table layout follows the user-supplied in-game screenshot. The homepage roster remains available; navigation and character-sheet return links open the new directory.

The page fetches and validates the existing `members.json` manifest. Approved mains are displayed by default; the optional linked-alt view preserves the main relationship and does not inflate the approved-member total. It loads all public character profiles through the existing `/api/aion2?type=info&member=<slug>` route, with four requests in flight at most. There is no new server-side data store, bot change or approval path.

The table supports name, class, level, item level, combat power and server sorting. Stats come only from identity-matched PLAYNC responses. Item level comes from `stat.statList[type=ItemLevel]`, not combat power. Unknown stats stay last in both directions, including during partial outages. Search, class and alt filters combine. Sorting uses natural character-name ordering and deterministic ties.

Guild role/rank, comments, map location and online status are not present in the currently observed public profile schema. Do not infer them from profile availability, officer roles, displayed titles or the screenshot. Profile-data status is explicitly a fetch status, never player presence. A refresh outage retains earlier values with a visible failure marker and last successful check time. PLAYNC profiles may be cached for five minutes.

Validation: `node --test tests/*.test.mjs`, browser checks with actual profiles and injected upstream failures, responsive table scroll, keyboard sorting, class/search/alt filters, profile links, missing portraits and desktop/mobile screenshots. Save private browser artifacts in `output/member-directory/` and exclude them from Git and deployment.
