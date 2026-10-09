// Public profile values only. An available profile does not mean a player is online.
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
export const DIRECTORY_SORTS = Object.freeze({ name: 'Character name', className: 'Class', level: 'Level', itemLevel: 'Item level', combatPower: 'Combat power', serverName: 'Server' });
const numericSorts = new Set(['level', 'itemLevel', 'combatPower']);
function number(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+(\.\d+)?$/.test(value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

export function normalizeDirectoryProfile(raw, member) {
  const data = raw?.data || raw;
  const profile = data?.profile;
  if (typeof profile?.characterName !== 'string' || profile.characterName.toLocaleLowerCase() !== member.name.toLocaleLowerCase() || String(profile.serverId) !== member.serverId) {
    throw Error('Profile does not match this character.');
  }
  const stats = Array.isArray(data.stat?.statList) ? data.stat.statList : [];
  return {
    level: number(profile.characterLevel), itemLevel: number(stats.find(stat => stat?.type === 'ItemLevel')?.value),
    combatPower: number(profile.combatPower), title: typeof profile.titleName === 'string' ? profile.titleName : '',
  };
}

export function createDirectoryRows(members) {
  const row = (member, main = null) => ({
    slug: member.slug, name: member.name, className: member.className, serverName: member.serverName,
    serverId: member.serverId, profileId: member.profileId, portrait: member.portrait,
    mainSlug: main?.slug ?? null, mainName: main?.name ?? null,
    level: null, itemLevel: null, combatPower: null, title: '', status: 'loading', checkedAt: null,
  });
  return members.flatMap(member => [row(member), ...(member.alts || []).map(alt => row(alt, member))]);
}

export function selectDirectoryRows(rows, { query = '', className = 'all', includeAlts = false, sort = 'level', direction = 'desc' } = {}) {
  const key = Object.hasOwn(DIRECTORY_SORTS, sort) ? sort : 'level';
  const search = query.trim().toLocaleLowerCase();
  const sign = direction === 'asc' ? 1 : -1;
  return rows.filter(row => (includeAlts || !row.mainSlug) && (className === 'all' || row.className === className) &&
    (!search || [row.name, row.className, row.mainName, row.title, row.serverName].filter(Boolean).join(' ').toLocaleLowerCase().includes(search)))
    .sort((a, b) => {
      const left = a[key], right = b[key];
      if (left == null && right != null) return 1;
      if (right == null && left != null) return -1;
      const primary = left == null ? 0 : numericSorts.has(key) ? left - right : collator.compare(left, right);
      return primary * sign || collator.compare(a.name, b.name) || collator.compare(a.slug, b.slug);
    });
}
