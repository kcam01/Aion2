import roster from './members.json' with {type:'json'};
import {validateRoster, findMember} from './member-roster.js';

// Public character identities from officer-approved Discord links.
export const members = Object.freeze(validateRoster(roster));

// Keep shared profile links working after an approved character changes server.
const legacySlugs = new Map([
  ['sarcodine', 'char-nae-2106-ad98f4dc135a131f566a'],
]);

export function getMember(slug) {
  const canonicalSlug = typeof slug === 'string' ? legacySlugs.get(slug.toLowerCase()) ?? slug : slug;
  return findMember(members, canonicalSlug);
}

export function officialProfile(member) {
  return `https://aion2.plaync.com/en-us/characters/${member.serverId}/${encodeURIComponent(member.profileId)}?region=${member.region}`;
}
