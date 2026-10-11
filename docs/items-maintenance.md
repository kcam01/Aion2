# Item pages maintenance

`/item?id=<id>` renders one AION 2 item from `items/<last two digits of id>.json`. The Discord `/item` command and the character-sheet gear popup link here. PLAYNC equipment IDs are the same as questlog item IDs.

## Where the data comes from

The bot host's `exalted-item-sync.timer` runs daily at 10:00 UTC. It reads questlog.gg's public AION 2 database. That list caps every query at 1,000 rows, so the job splits by category, grade and type. Items with no type inside an oversized bucket cannot be reached (8 of 9,260 on 2026-10-11). The job also fetches details for new items and for a rotating seventh of the catalog, so each item is rechecked at least weekly.

It commits `Sync AION 2 item snapshot` to `main` only when a shard changed. The commit touches nothing outside `items/`. Do not edit shards by hand; the next run would overwrite them.

## What is published

Name, PLAYNC grade name, type, category, item level, required level (above 1), base stats, random stats with the roll count, and sell price (sellable items only). Icons point to PLAYNC's CDN. `item-data.js` rejects any other field, any other icon host, or malformed values. The bot's `item_catalog.validate_record` applies the same rules before publishing.

## When something looks wrong

- **Stale or missing items:** check `data/item-sync-health.json` on the bot host. `state: error` explains why nothing was published; the previous snapshot stays live.
- **A raw ID such as `mysterystat` instead of a label:** add it to `exalted/item_labels.py` (label and `flat`/`percent`/`hundredths`) and redeploy the sync phase. `unknown_labels` in the health file lists every such ID.
- **Grade names:** codes 11/21/31/41/71 match PLAYNC. 51 uses questlog's "Mythic" until PLAYNC data confirms its name.
