# Exalted events and Drops schedule

Add `/events` and a three-item homepage preview using the existing emerald and gold design. Publish one curated `events.json` manifest, shared by both views, with official sources, participation instructions, reward highlights, date precision and separate claim deadlines.

Exact timestamps display in America/Chicago, including daylight saving time. Published date-only ranges remain date-only: never infer midnight, activation or a deadline countdown. Conflicting start times and unlock conditions are visible on the affected entry. Exact ended campaigns leave the active schedule; date-only windows are archived once their final date has passed everywhere. Earned rewards with a future claim deadline remain in a separate claim section.

Implementation: pure schedule helpers and meaningful time-boundary tests; public data; accessible filter buttons and responsive event cards; homepage preview; deployment and desktop/mobile verification. Keep the current member profiles and guild rules intact.

Extend the existing hourly Discord heartbeat to maintain the manifest. Recheck primary sources, update material changes immediately and verification dates at most daily when unchanged. Stage only the schedule data during routine monitoring, run validation/tests, push without force, and verify production. Do not create another monitor or send duplicate Discord announcements.
