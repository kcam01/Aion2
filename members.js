import roster from './members.json' with {type:'json'};
import {validateRoster, findMember} from './member-roster.js';

// Public character identities from officer-approved Discord links.
export const members = Object.freeze(validateRoster(roster));

export function getMember(slug) {
  return findMember(members, slug);
}

export function officialProfile(member) {
  return `https://aion2.plaync.com/en-us/characters/${member.serverId}/${encodeURIComponent(member.profileId)}?region=${member.region}`;
}
