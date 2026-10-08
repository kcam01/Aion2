import { socialAccount } from '../creator-directory.js';
export function assertReadAccess({guildId,botId,member,roles,channel,application}) {
  // Missing content intent can return successful responses with stripped message fields.
  if (!(Number(application?.flags)&((1<<18)|(1<<19)))) throw Error('Discord message content access unavailable; scan stopped');
  if (!Array.isArray(member?.roles) || !Array.isArray(roles) || !Array.isArray(channel?.permission_overwrites)) throw Error('Discord read permissions could not be verified');
  let permissions=0n;
  for (const role of roles) if (role.id===guildId || member.roles.includes(role.id)) permissions|=BigInt(role.permissions);
  if (!(permissions&8n)) {
    const overwrites=channel.permission_overwrites;
    const everyone=overwrites.find(o=>o.type===0 && o.id===guildId);
    if (everyone) permissions=(permissions&~BigInt(everyone.deny))|BigInt(everyone.allow);
    let denied=0n, allowed=0n;
    for(const item of overwrites.filter(o=>o.type===0 && member.roles.includes(o.id))) { denied|=BigInt(item.deny);allowed|=BigInt(item.allow); }
    permissions=(permissions&~denied)|allowed;
    const personal=overwrites.find(o=>o.type===1 && o.id===botId);
    if(personal)permissions=(permissions&~BigInt(personal.deny))|BigInt(personal.allow);
    if((permissions&66560n)!==66560n)throw Error('Discord channel/history access unavailable; scan stopped');
  }
}
export function messageUrls(message) {
  const urls=[...(message.content||'').matchAll(/https:\/\/[^\s<>"`]+/g)].map(m=>m[0]);
  for (const embed of message.embeds||[]) if (typeof embed.url==='string') urls.push(embed.url);
  return [...new Set(urls.map(raw=>{
    raw=raw.replace(/[.,;!?]+$/,'');
    while (raw.endsWith(')') && (raw.match(/\)/g)||[]).length>(raw.match(/\(/g)||[]).length) raw=raw.slice(0,-1);
    return raw;
  }))];
}
export function youtubeVideoUrl(raw) {
  let u; try { u=new URL(raw); } catch { return null; }
  if (u.protocol!=='https:' || u.username || u.password || u.port) return null;
  const host=u.hostname.replace(/^(www|m)\./,''), parts=u.pathname.split('/').filter(Boolean);
  const id=host==='youtu.be'?parts[0]:host==='youtube.com'?(parts[0]==='watch'?u.searchParams.get('v'):['live','shorts','embed'].includes(parts[0])?parts[1]:null):null;
  return /^[a-zA-Z0-9_-]{11}$/.test(id)?`https://www.youtube.com/watch?v=${id}`:null;
}
export async function creatorPosts(messages, resolveVideo) {
  const posts=[], unresolved=[], resolved=new Map();
  for (const message of messages) {
    if (message.author?.bot || !/^\d+$/.test(message.author?.id)) continue;
    const accounts=[];
    for (const raw of messageUrls(message)) {
      let account=socialAccount(raw);
      const video=!account && youtubeVideoUrl(raw);
      if (video) {
        if (!resolved.has(video)) resolved.set(video,await resolveVideo(video));
        account=socialAccount(resolved.get(video));
      }
      if (account) accounts.push(account);
      else unresolved.push({url:raw,messageId:message.id});
    }
    if (accounts.length) posts.push({authorId:message.author.id,displayName:String(message.member?.nick||message.author.global_name||message.author.username).replace(/[\x00-\x1f]/g,'').slice(0,120),accounts});
  }
  return {posts,unresolved};
}
