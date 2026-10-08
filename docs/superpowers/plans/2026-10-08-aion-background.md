# AION 2 background implementation plan

**Goal:** Add a cohesive AION 2 / Asmodian-inspired background to Exalted's home, events, and character pages.

**Design:** Keep the existing emerald-and-gold identity, layout, content and controls. Use a custom ChatGPT imagegen landscape of floating ruins, mist and a distant black-winged Daeva. The left side stays quiet for hero copy; scenery appears through the hero and page margins. Dark overlays protect text contrast. This is original themed artwork, not official game art.

**Architecture:** A shared `background.css` provides a decorative, noninteractive fixed backdrop with an opaque fallback, layered gradients, and responsive WebP sources. Each HTML page loads it after its existing styles. Character pages receive stronger dimming and preserve their portrait header. No JavaScript or animation is needed for the background.

**Implementation:**

- [x] Generate and inspect the landscape with built-in ChatGPT imagegen; retain the prompt and source in `output/aion-background/`.
- [x] Export desktop and portrait mobile WebP assets into `assets/`, with a combined budget below 1 MB where visual quality allows. Final sizes: 177,060 and 107,106 bytes.
- [x] Add `background.css`, link it from `index.html`, `events.html`, and `member.html`, and preload the correct image using matching media conditions.
- [x] Verify home, events and member pages at desktop and mobile sizes, including scrolling, text readability, image requests, links, filters and character controls. Verify missing-image fallback and reduced-motion behavior.
- [x] Run `node --test tests/*.test.mjs` and `git diff --check`. All 46 regression tests pass.
- Release: review the scoped diff and publish through the existing repository deployment; verify the live pages and asset responses. Keep deployment receipts with the local browser evidence in `output/aion-background/`.

**Out of scope:** Navigation redesign, content changes, roster data, Discord bot changes, video backgrounds, new dependencies, and provider fallback.
