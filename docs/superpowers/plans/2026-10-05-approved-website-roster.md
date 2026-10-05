# Approved website roster implementation plan

Goal: show every officer-approved Discord character link on the website automatically.

Architecture: a read-only SQLite exporter runs on the bot host once per minute. It publishes only public character fields to members.json using a dedicated deploy key for kcam01/Aion2. A normal Git push triggers the existing Vercel deployment. Each commit changes only members.json, based on the latest main commit, and a rejected push retries on the next run. The bot and its approval database keep working during website failures.

The alternative of a publicly reachable bot endpoint adds an inbound service and availability dependency. A new hosted database adds another account/storage dependency. The existing Git/Vercel path is appropriate for this small guild and provides a durable last successful roster.

Public fields: stable character slug, name, class, server ID/name, region, official profile ID and portrait URL. Never publish Discord IDs, officer IDs, approval records, notification preferences, credentials or full snapshots. Pending/rejected links stay private. Unlink removes the current roster entry; Git retains previously published public data. Preserve existing member URLs by matching stable character identity, not name.

- [ ] Write and run failing tests for roster validation and approved-only export, duplicate names, stable URLs, privacy, malformed snapshots, removals and normal Git publication.
- [ ] Implement members.json, the shared roster validator, and dynamic homepage cards using textContent and validated portrait URLs. Keep existing member profile routes working.
- [ ] Implement a bounded one-shot publisher and systemd timer; no changes to bot approvals or SQLite writes. Verify non-fast-forward refusal and retry without resetting any user checkout.
- [ ] Run site and bot tests, review exact changes, publish the website, and verify production data/UI.
- [ ] Install the dedicated repository deploy key and timer, verify a real public-only roster sync and an unchanged rerun, then check service health and production member profiles.

Validation commands: node --test tests/*.test.mjs; .venv/Scripts/python.exe -m unittest discover -s tests; git diff --check; node scripts/verify-events.mjs. Remote verification must show an enabled timer, successful one-shot service, current sync receipt, public-field-only members.json, unchanged bot database integrity, and the deployed roster matching approved character identities.
