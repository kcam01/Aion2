export const PLATFORM_NAMES = {twitch:'Twitch',youtube:'YouTube',kick:'Kick',instagram:'Instagram',tiktok:'TikTok',x:'X',bluesky:'Bluesky',linktree:'Linktree',facebook:'Facebook'};
const text = (value, max=120) => typeof value === 'string' && value.trim() && value.length <= max && !/[\x00-\x1f]/.test(value);
const slug = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,95}$/.test(value);
export function socialAccount(raw) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host=url.hostname.toLowerCase().replace(/^(www|m)\./,''), parts=url.pathname.split('/').filter(Boolean);
  if (!parts[0]) return null;
  let platform, handle, path;
  if (host==='twitch.tv' && /^[a-z0-9_]{2,25}$/i.test(parts[0]) && !['directory','downloads','settings','subscriptions','videos','search','inventory','wallet','jobs','p','turbo'].includes(parts[0].toLowerCase())) {
    if (parts.length>1 && !['videos','about','schedule','clip'].includes(parts[1])) return null;
    platform='twitch'; handle=parts[0].toLowerCase(); path=`https://www.twitch.tv/${handle}`;
  } else if (host==='youtube.com' && (/^@[\p{L}\p{N}_.-]{1,100}$/u.test(parts[0]) || (['channel','c','user'].includes(parts[0]) && typeof parts[1]==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(parts[1])))) {
    platform='youtube'; handle=parts[0].startsWith('@')?parts[0]:`${parts[0]}/${parts[1]}`; path=`https://www.youtube.com/${handle}`;
  } else if (host==='kick.com' && /^[a-z0-9_-]{2,50}$/i.test(parts[0]) && !['categories','search','dashboard','settings','clips'].includes(parts[0].toLowerCase())) {
    platform='kick'; handle=parts[0].toLowerCase(); path=`https://kick.com/${handle}`;
  } else if (host==='instagram.com' && /^[a-z0-9_.]{1,30}$/i.test(parts[0]) && !['p','reel','reels','explore','stories','accounts','direct'].includes(parts[0].toLowerCase()) && parts.length===1) {
    platform='instagram'; handle=parts[0].toLowerCase(); path=`https://www.instagram.com/${handle}`;
  } else if (host==='tiktok.com' && /^@[a-z0-9_.]{1,30}$/i.test(parts[0])) {
    platform='tiktok'; handle=parts[0].slice(1).toLowerCase(); path=`https://www.tiktok.com/@${handle}`;
  } else if (['twitter.com','x.com'].includes(host) && /^[a-z0-9_]{1,15}$/i.test(parts[0]) && !['i','home','search','explore','intent','share','settings','messages'].includes(parts[0].toLowerCase())) {
    platform='x'; handle=parts[0].toLowerCase(); path=`https://x.com/${handle}`;
  } else if (host==='bsky.app' && parts[0]==='profile' && typeof parts[1]==='string' && /^[a-z0-9.-]{3,100}$/i.test(parts[1])) {
    platform='bluesky'; handle=parts[1].toLowerCase(); path=`https://bsky.app/profile/${handle}`;
  } else if (host==='linktr.ee' && /^[a-z0-9_.]{1,100}$/i.test(parts[0]) && parts.length===1) {
    platform='linktree'; handle=parts[0].toLowerCase(); path=`https://linktr.ee/${handle}`;
  } else if (host==='facebook.com' && /^[a-z0-9.]{2,100}$/i.test(parts[0]) && parts.length===1 && !['share','watch','reel','groups','login','profile.php'].includes(parts[0].toLowerCase())) {
    platform='facebook'; handle=parts[0].toLowerCase(); path=`https://www.facebook.com/${handle}`;
  } else return null;
  return {platform,handle,url:path};
}

export function groupCreators(posts, approved, roster, ids) {
  const groups=new Map();
  for (const post of posts) {
    if (!post.accounts.length) continue;
    let group=groups.get(post.authorId);
    if (!group) {
      const link=approved[post.authorId];
      const member=link && roster.members.find(m=>m.region===link.region && m.serverId===String(link.server_id) && m.profileId===link.character_id);
      const character=member?{slug:member.slug,name:member.name,portrait:member.portrait || '',alts:(member.alts||[]).map(a=>({slug:a.slug,name:a.name}))}:null;
      group={id:ids[post.authorId],displayName:post.displayName,character,accounts:[]};
      groups.set(post.authorId,group);
    }
    for (const account of post.accounts) if (!group.accounts.some(a=>a.url===account.url)) group.accounts.push(account);
  }
  return [...groups.values()].map(c=>({...c,accounts:c.accounts.sort((a,b)=>a.url.localeCompare(b.url))})).sort((a,b)=>a.displayName.localeCompare(b.displayName)||a.id.localeCompare(b.id));
}

function onlyKeys(value, keys) { return value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).every(k=>keys.includes(k)); }
export function validateCreators(data) {
  if (!onlyKeys(data,['schema_version','updated_at','creators']) || data.schema_version!==1 || !Number.isFinite(Date.parse(data.updated_at)) || !Array.isArray(data.creators) || data.creators.length>500) throw Error('Invalid creator directory');
  const ids=new Set();
  for (const c of data.creators) {
    if (!onlyKeys(c,['id','displayName','character','accounts']) || !slug(c.id) || ids.has(c.id) || !text(c.displayName) || !Array.isArray(c.accounts) || !c.accounts.length || c.accounts.length>30) throw Error('Invalid creator');
    ids.add(c.id);
    const urls=new Set();
    for (const a of c.accounts) {
      const canonical=socialAccount(a?.url);
      if (!onlyKeys(a,['platform','handle','url']) || !canonical || canonical.url!==a.url || canonical.platform!==a.platform || canonical.handle!==a.handle || urls.has(a.url)) throw Error('Invalid social account');
      urls.add(a.url);
    }
    if (c.character!==null) {
      const ch=c.character;
      if (!onlyKeys(ch,['slug','name','portrait','alts']) || !slug(ch.slug) || !text(ch.name) || !Array.isArray(ch.alts)) throw Error('Invalid character');
      if (ch.portrait) { const u=new URL(ch.portrait); if (u.protocol!=='https:' || u.hostname!=='profileimg.plaync.com' || u.username || u.password || u.port) throw Error('Invalid portrait'); }
      for (const alt of ch.alts) if (!onlyKeys(alt,['slug','name']) || !slug(alt.slug) || !text(alt.name)) throw Error('Invalid alt');
    }
  }
  return data;
}

export const accountKey = a => `${a.platform}:${a.handle}`;
export const chooseStream = (streams, selected) => streams.find(s=>s.key===selected) || streams[0] || null;
export function embedUrl(stream, hostname) {
  if (!/^[a-z0-9.-]+$/i.test(hostname)) return null;
  if (stream.platform==='twitch' && /^[a-z0-9_]{2,25}$/.test(stream.handle)) return `https://player.twitch.tv/?${new URLSearchParams({channel:stream.handle,parent:hostname,autoplay:'true',muted:'true'})}`;
  if (stream.platform==='youtube' && /^[a-zA-Z0-9_-]{11}$/.test(stream.videoId)) return `https://www.youtube-nocookie.com/embed/${stream.videoId}?autoplay=1&mute=1&playsinline=1`;
  return null;
}
