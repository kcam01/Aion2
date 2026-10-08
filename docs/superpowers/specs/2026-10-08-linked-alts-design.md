# Linked alternate characters

Date: 2026-10-08
Status: Approved by the user on 2026-10-08. Portraits belong beneath the main character information on the character sheet. Latest instruction: auto approve alts.

## Requested behavior

Add a Discord `/linkalts` command. Show linked alternate characters as small clickable portraits beneath the main character information on the website. Clicking a portrait shows that alternate character's information.

## Recommended experience

- Keep `/link character server` as the main-character setup.
- Add `/linkalts character server` to request one alternate character at a time. Repeating the command adds further alts. Require an approved main first and use the existing NA East character lookup and server autocomplete.
- Automatically approve each alt after resolving its public character and validating its snapshot. Require an already approved main and reject duplicate claims across mains and alts. No officer review card is sent for an alt.
- Add `/unlinkalt character` with autocomplete over the caller's own alts, so an alt can be removed independently. Show linked alts alongside their main in the officer links list.
- Show an **Alts** portrait row beneath the main's information on its character sheet, before the detail tabs. Include visible character names and accessible link labels. Hide the row when no approved alts exist. The home-page roster keeps its current layout.
- Open the existing full character-sheet page when an alt portrait is clicked. It shows that alt's live level, class, server, combat power, equipment, skills, titles, and other currently supported fields. Display its relationship to the main and navigation back to the main and sibling alts.
- Keep one guild roster card and one member-count entry per main. Each alt has its own stable, shareable character-sheet URL.
- Use existing public PLAYNC portraits, with initials if a portrait is missing or fails. Wrap portrait rows on small screens and retain visible keyboard focus and comfortable touch targets.

## Alternatives considered

1. **Portrait links to full character sheets (recommended):** uses the current profile interface and error handling, supports direct links, and makes all available alt information accessible.
2. **Expand an inline summary below the portraits:** keeps the main visible, but only fits a few stats and still needs navigation for equipment and other details.
3. **Switch the main's entire sheet in place:** smoother switching, but adds request cancellation and state/history management to every profile section.

## Storage and bot integration

Add an alternate-character table related to the existing main-link row. Store the character identity, unique link identifier, link timestamp, and validated snapshot. Deleting a main link also deletes its alt relationships. Existing main links and their progress records remain usable without migration to a new identity model.

Enforce global character uniqueness across mains and alts inside the same SQLite write transaction, including both main-link and alt-link request paths. A character cannot be linked twice, linked as its own alt, or claimed by a second player. Require the exact approved parent link to still exist after upstream API requests complete. Guard against concurrent main unlinking or replacement.

Alt linking uses the calling member identity and an approved main as its prerequisite. It does not grant Recruit again. The requested feature is character linking and website profiles; automatic alt progress announcements are outside this change. Existing main-character announcements continue using their current settings.

Keep alt handling in a focused module and make small integrations into `bot.py`, the store, and review/listing commands. Private command confirmations explain successful linking/removal, duplicate claims, and temporary PLAYNC failures. `/help` documents the new commands.

## Public roster and API

Extend the roster format with an optional `alts` array on a main entry; entries without it stay valid. Each alt contains the same allowlisted public identity and portrait fields as a main. Disallow nested alt arrays and validate global uniqueness across the complete roster.

Keep the exported main-member collection suitable for guild cards and member counts. Add a flattened approved-character lookup for `/member`, `/api/aion2`, and character comparison, plus helpers for retrieving a character's main and siblings. Preserve existing main slugs and aliases.

Update the read-only roster publisher to include approved alts only under approved parents. Do not publish Discord user IDs, approval metadata, or private database identifiers. Preserve previous alt slugs by public character identity. Main and alt roster reads must use one consistent database snapshot.

Deploy compatible website readers before allowing the publisher to emit alt arrays, so automatic roster pushes cannot break the deployed site. The publisher continues to change only `members.json` and retry concurrent Git updates.

## Verification and release

- Bot tests: approved-parent requirement, multiple alts, identity conflicts across both tables, automatic approval, invoker-only ownership, main removal or replacement during lookup, individual unlink, cascading main unlink, and compatibility with existing main links.
- Publisher/API tests: approved-only export, stable slugs, private-field exclusion, old roster compatibility, malformed/duplicate/nested alt rejection, main counts, and independent alt profile resolution.
- Browser verification at desktop and mobile sizes: character-sheet portrait rows, successful alt navigation, return-to-main navigation, multiple alts, keyboard focus, portrait fallback, no horizontal overflow, and isolated profile failures.
- Run the existing Node regression suite and bot Python suite, JavaScript syntax checks, and diff whitespace validation.
- Before release, inspect the actual bot host and deployed source versions, preserve the database with a recoverable backup, and reconcile concurrent website edits. Deploy the website reader changes, then bot/publisher changes; verify registered commands, bot and sync service health, roster compatibility, and the production website.
- Use local test fixtures for multi-alt rendering until real alts are linked. Do not fabricate public ownership links to demonstrate the feature. Record whether a real Discord alt-link command was exercised or remains untested.

## Source inspection

The checked local implementation currently stores one main in `links` per Discord user, binds approval buttons to request revisions, exports approved main identities through `exalted/roster_sync.py`, validates public records in `member-roster.js`, and loads full profiles through `member.html`, `app.js`, and `api/aion2.js`.

The workspace already contains unrelated website edits. Implementation must preserve those changes and avoid including them in this feature's release accidentally.

