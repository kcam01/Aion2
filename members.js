// Verified public PLAYNC identities. This is the featured guild directory,
// not an automatically discovered in-game guild roster.
export const members = [
  {
    slug: 'sarcodine', name: 'Sarcodine', className: 'Gladiator',
    serverId: '2102', serverName: 'Zikel', region: 'nae',
    profileId: '8iCddEXDDnuEC1Z-27KJQCcDEUHKdMFWgFqSCrcOm7A=',
    portrait: 'https://profileimg.plaync.com/game_profile_images/aion2global/images?gameServerKey=2102&charKey=591660401046099066',
  },
  {
    slug: 'kcamyazimoto', name: 'KcamYazimoto', className: 'Cleric',
    serverId: '2101', serverName: 'Israphel', region: 'nae',
    profileId: 'F0Ubce33Dq_LpNdYg_lVaqPZpJG8FPD3oqJ55tgv1cY=',
    portrait: 'https://profileimg.plaync.com/game_profile_images/aion2global/images?gameServerKey=2101&charKey=591378926069487453',
  },
];

export function getMember(slug = 'kcamyazimoto') {
  return typeof slug === 'string' ? members.find(member => member.slug === slug.toLowerCase()) : undefined;
}

export function officialProfile(member) {
  return `https://aion2.plaync.com/en-us/characters/${member.serverId}/${encodeURIComponent(member.profileId)}?region=${member.region}`;
}
