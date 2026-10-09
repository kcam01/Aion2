# Sortable guild roster

Build `/members` from the supplied in-game roster screenshot: a dark, full-width table, quiet cyan headings, generous rows, character identity at the left and numeric stats aligned into columns. Retain the Exalted site navigation and use the existing artwork under a strong dark overlay. No generated art is needed because the user supplied the visual reference.

The existing approved roster and public profile API support character name, class, level, item level, combat power, server, portrait and displayed title. Guild rank, comment, current map location and online state are unavailable; do not infer them or copy stale screenshot values. Explain the limitation below the table.

1. Test normalization (including null/zero and wrong-profile responses), alphabetical/numeric sorting, unknown values last in either direction, combined filtering and separate main/alt membership.
2. Implement pure directory helpers in `member-directory-data.js`, a native accessible table in `members.html`, and screenshot-informed styling in `member-directory.css`.
3. Implement `member-directory.js`: fetch and validate `members.json`; render all approved mains immediately; fetch profiles through the existing endpoint with at most four concurrent requests; keep rows when requests fail, retain earlier stats if refresh fails, and provide refresh/search/class/include-alts controls. Sort defaults to level descending, headers expose `aria-sort`, and a mobile sort control works without horizontal header scrolling.
4. Point global “Our members” navigation and character-sheet roster links to `/members`; retain the homepage roster and add a direct sortable-roster link.
5. Run the full Node suite and browser checks for live profiles, sorting/filtering, keyboard access, partial/total outages, refresh preservation and mobile overflow. Visually review desktop/mobile screenshots.
6. Commit only feature files, integrate with current main without overwriting the automatic roster publisher, deploy using GitHub/Vercel, and verify live page data, profile links, navigation and responsive behavior.

Files: new `members.html`, `member-directory.css`, `member-directory.js`, `member-directory-data.js`, `tests/member-directory.test.mjs`, `docs/member-directory.md`; edit `index.html`, `events.html`, `builds.html`, `creators.html`, `member.html`. No bot or member-approval changes.
