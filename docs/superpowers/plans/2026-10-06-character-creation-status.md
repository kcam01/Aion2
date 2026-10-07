# Character creation status implementation

Goal: provide `/server-status` in Exalted and an Azphel character-creation panel beside the website joining instructions.

Use one public `/api/server-status` endpoint for both consumers. Read the gaming.tools public tracker, label it as a community source, and normalize only NA East servers. Azphel / Asmodian / 2106 is the default. Open requires an explicit false creation-block flag, running server, no maintenance, live source states, matching server identity, and an observation no older than 120 seconds. Unknown fields, inaccessible upstream, stale/future timestamps, missing or duplicate identities must never become Open. Keep source time separate from request time. Cache successful results for at most 20 seconds and no longer than their remaining freshness. Errors are not cached.

- [x] Add failing Node regression tests for source decoding, state mapping, timestamps, identity, and endpoint failure handling.
- [x] Implement the shared endpoint and homepage panel, refresh every 30 seconds and on return to the page, with a manual refresh and source link.
- [x] Add failing Python command tests, then implement a guild-scoped private `/server-status` response with optional NA East server selection and `/help` documentation.
- [x] Run existing Node and Python suites and review the website at desktop/mobile sizes.
- [ ] Verify hosting access to the tracker, deploy website and bot with backups, and verify the live endpoint, registered command, and service health. Report any source access limitation accurately.

No automatic opening announcements are added by this feature. No Discord identities or bot state are exposed by the public endpoint.

Verification: 45 Node tests and 149 Python tests passed. Browser reviewed at desktop and 390px mobile with no horizontal overflow. Source contract and all sixteen server identities were read from the public tracker's rendered page/client data.

Current external limitation: direct requests to gaming.tools returned HTTP 403 from the workstation and bot host; the Vercel preview also returned unknown/no observation through the endpoint. Browser access works. The feature therefore currently shows unavailable with a direct tracker link; live Open/Blocked availability is not verified in production and needs a source permitting automated requests. No browser-challenge bypass or stale hard-coded status is used.
