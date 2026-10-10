# Exalted character gallery

The public /gallery page displays AION 2 character images shared in Discord #general (1556392761337315329), in Exalted (1556392756836966481). It displays images only, with no visible titles, captions, credits, search or descriptions. Accessible alt text and internal source metadata remain available for validation and maintenance. Character ownership is never inferred.

## Import and publication

The gallery worker runs on the existing bot host with the same Discord bot identity. It sends no Discord messages and does not change roles or commands. A separate systemd timer checks every 15 minutes. The initial scan covers all available history, and subsequent scans reconcile deleted attachments and edited embeds against a complete inventory. Deleted source images disappear from the current site; prior public images remain in Git history.

OpenRouter uses google/gemma-4-26b-a4b-it:free with reasoning disabled and provider prompt/completion price caps of zero. No paid fallback is allowed. Only likely AION 2 character images with confidence at least 0.85 and a safe result qualify. Memes, real people, other games and panels without a visible character are excluded. AI classifications can be imperfect.

Original attachments are processed in memory, stripped of metadata and exported as WebP: up to 2400 pixels for viewing and 720 by 900 for thumbnails. SHA-256 deduplicates identical image bytes. Different crops or recompressions remain separate images. The source image is not creatively edited. Assets live under assets/gallery/ and the public manifest is gallery.json.

Private state, classification results, attachment mapping and health live under /home/kcam/bots/exalted/data/gallery. Only gallery.json and its referenced WebP files are published. No API keys, raw message text, Discord account IDs or private bot state are committed. The OpenRouter key is in /home/kcam/.config/exalted-gallery.env, mode 600, initially provisioned from D:/AI/.env; Discord credentials use the bot's existing environment file.

The publisher uses its own bare checkout (data/gallery-sync.git), creates a commit from the latest main, validates the entire changed-path list, and performs a normal non-force push. It cannot commit other site files. Concurrent website/roster pushes cause a retry on the next run. Unchanged content produces no commit or deployment.

## Failure handling

Incomplete history or lost message-content access stops publication, preserving the deployed gallery. API failures are queued rather than treated as rejected images. Each pass has a 40-analysis budget. Results persist after each successful analysis, so a restart resumes from cached work. A file lock prevents overlapping imports. The timer's 15-minute service limit also bounds outages.

Worker: scripts/gallery/gallery_sync.py. Pure contracts: gallery_core.py. Publisher: gallery_publish.py. Runtime dependency: Pillow, installed in the bot virtual environment. Service definitions are in scripts/gallery/.

Health: data/gallery/health.json reports ready, pending or error, counts, and publication commit. A pending state means some images still await analysis. Check systemctl status exalted-gallery-sync.timer and journalctl -u exalted-gallery-sync.service.

To rerun manually on the host:
```sh
sudo systemctl start exalted-gallery-sync.service
```

To pause imports:
```sh
sudo systemctl stop exalted-gallery-sync.timer
```

## Validation

Run node --test tests/*.test.mjs and python -B -m unittest discover -s tests -p 'test_gallery_*.py'. Browser validation covers desktop/mobile widths, the images-only requirement, navigation and the keyboard-accessible full-size viewer. The first image set is visually checked before deployment.
