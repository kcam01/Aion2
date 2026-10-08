export const CLASSES = ['Gladiator', 'Templar', 'Assassin', 'Ranger', 'Sorcerer', 'Spiritmaster', 'Cleric', 'Chanter'];
export const CATEGORIES = { builds: 'Builds', guides: 'Guides', tools: 'Tools' };

// Canonicalize shared links, never credentials or private/local destinations.
export function canonicalGuideUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || /\.(local|localhost|internal|test)$/.test(host)) return null;
    if (['discord.com', 'discord.gg', 'discordapp.com', 'cdn.discordapp.com', 'media.discordapp.net'].includes(host)) return null;
    if (/\.(exe|msi|bat|cmd|ps1|zip|rar|7z|dmg|apk)$/i.test(url.pathname)) return null;
    if ([...url.searchParams.keys()].some(key => /^(token|access_token|auth|authorization|key|api_key|apikey|secret|password|signature|sig|code)$/i.test(key))) return null;
    if (['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
      const id = host === 'youtu.be' ? url.pathname.slice(1) : url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/)?.[1];
      if (!/^[\w-]{11}$/.test(id || '')) return null;
      return `https://www.youtube.com/watch?v=${id}`;
    }
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    // Keep meaningful fragments and build IDs; these can encode a complete build.
    return url.href;
  } catch { return null; }
}

export function validateLibrary(data) {
  if (data?.version !== 1 || !Number.isFinite(Date.parse(data.updated_at)) || !Array.isArray(data.links)) throw Error('Invalid guide library');
  if (Object.keys(data).some(key => !['version', 'updated_at', 'links'].includes(key))) throw Error('Unexpected public library field');
  const ids = new Set(), urls = new Set();
  for (const link of data.links) {
    if (Object.keys(link).some(key => !['id', 'url', 'title', 'description', 'source', 'category', 'format', 'classes', 'tags', 'shared_at'].includes(key))) throw Error('Unexpected public guide field');
    if (!/^[a-z0-9-]{1,90}$/.test(link.id) || ids.has(link.id)) throw Error('Invalid or duplicate guide ID');
    if (canonicalGuideUrl(link.url) !== link.url || urls.has(link.url)) throw Error('Invalid or duplicate guide URL');
    for (const key of ['title', 'description', 'source']) {
      if (typeof link[key] !== 'string' || !link[key].trim() || link[key].length > (key === 'description' ? 300 : 140)) throw Error(`Invalid guide ${key}`);
    }
    if (!Object.hasOwn(CATEGORIES, link.category) || !['video', 'article', 'tool'].includes(link.format)) throw Error('Invalid guide category or format');
    if (!Array.isArray(link.classes) || link.classes.some(value => !CLASSES.includes(value))) throw Error('Invalid guide class');
    if (!Array.isArray(link.tags) || link.tags.some(value => typeof value !== 'string' || value.length > 40)) throw Error('Invalid guide tags');
    if (!Number.isFinite(Date.parse(link.shared_at))) throw Error('Invalid shared date');
    ids.add(link.id); urls.add(link.url);
  }
  return data;
}

export function filterGuides(links, { query = '', category = 'all', className = 'all' } = {}) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return links.filter(link => (category === 'all' || link.category === category)
    && (className === 'all' || !link.classes.length || link.classes.includes(className))
    && words.every(word => [link.title, link.description, link.source, link.format, ...link.classes, ...link.tags].join(' ').toLocaleLowerCase().includes(word)))
    .sort((a, b) => Date.parse(b.shared_at) - Date.parse(a.shared_at) || a.id.localeCompare(b.id));
}
