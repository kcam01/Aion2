import roster from './members.json' with {type:'json'};
import {validateRoster, findMember, allCharacters, findCharacterFamily} from './member-roster.js';

// Approved mains and their automatically linked alternate characters.
export const members = Object.freeze(validateRoster(roster));
export const characters = Object.freeze(allCharacters(members));

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

export function getCharacterFamily(slug) {
  const member = getMember(slug);
  return member ? findCharacterFamily(members, member.slug) : undefined;
}
