# Character gallery implementation plan

**Goal:** Publish a responsive Exalted gallery of AION 2 character images from #general, classified through OpenRouter free vision inference.

**Architecture:** A separate worker on the existing bot host reads Discord with the existing bot identity. It scans full channel history, caches strict classification results by SHA-256, strips metadata and creates WebP display/thumbnail assets. It publishes only gallery.json and assets/gallery/ through a dedicated bare Git checkout and normal non-force pushes. The static gallery uses the existing site shell, an images-only grid and a keyboard-accessible full-size viewer.

**Scope:** General channel 1556392761337315329 in guild 1556392756836966481. No Discord messages, role changes, invented character ownership or paid model fallback. API keys remain only in private server environment files. Ongoing updates default to every 15 minutes unless user chooses one-time import.

- [x] Add and run importer tests for free-only routing, conservative classifier parsing, attachment allowlist, duplicate detection and deletion reconciliation.
- [x] Implement scripts/gallery/gallery_core.py, gallery_sync.py and gallery_publish.py. Limit downloads, decode pixels safely, retry transient failures without marking them rejected, publish only after complete history scans.
- [x] Build gallery frontend with strict data validation, loading/error/empty states, responsive images and accessible full-size viewer; add navigation links.
- [x] Run initial Discord scan, inspect accepted images, copy optimized assets to local assets/gallery and validate desktop/mobile UI.
- [ ] Run website regression and Python tests; independent spec and code review; commit selected files and push normally.
- [ ] Install worker and systemd service/timer, verify health, live page/assets and no-change duplicate scan. Report actual import totals and any unresolved analysis backlog.
