const fields = new Set(['slug','name','className','serverId','serverName','region','profileId','portrait']);

export function validateRoster(roster) {
  if (!roster || roster.schema_version !== 1 || !Array.isArray(roster.members)) throw Error('Invalid member roster');
  const slugs = new Set(), identities = new Set();
  return roster.members.map(member => {
    if (!member || Object.keys(member).some(key => !fields.has(key)) || [...fields].some(key => typeof member[key] !== 'string')) throw Error('Invalid public member fields');
    if (!/^[a-z0-9][a-z0-9-]{0,95}$/.test(member.slug) || !/^\d{1,8}$/.test(member.serverId) || member.region !== 'nae') throw Error('Invalid character identity');
    for (const key of ['name','className','serverName','profileId']) {
      if (!member[key].trim() || member[key].length > 250 || /[\u0000-\u001f]/.test(member[key])) throw Error('Invalid character data');
    }
    if (member.portrait) {
      const url = new URL(member.portrait);
      if (url.protocol !== 'https:' || url.hostname !== 'profileimg.plaync.com' || url.username || url.password || url.port) throw Error('Invalid character portrait');
    }
    const identity = JSON.stringify([member.region,member.serverId,member.profileId]);
    if (slugs.has(member.slug) || identities.has(identity)) throw Error('Duplicate member');
    slugs.add(member.slug); identities.add(identity);
    return Object.freeze({...member});
  });
}

export function findMember(members, slug) {
  if (slug === undefined) return members.find(m => m.slug === 'kcamyazimoto') ?? members[0];
  return typeof slug === 'string' ? members.find(member => member.slug === slug.toLowerCase()) : undefined;
}
