export const MAX_STATUS_AGE=180000;
const unknown=()=>({state:'unknown'});
export function parseTwitch(html, handle, now=Date.now()) {
  try {
    const graph=[];
    for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      const data=JSON.parse(match[1]); graph.push(...(data['@graph'] || [data]));
    }
    const profile=graph.find(n=>n['@type']==='ProfilePage' && n.mainEntity?.url?.toLowerCase()===`https://www.twitch.tv/${handle}`);
    if (!profile) return unknown();
    // Only top-level broadcasts count; ItemList clips and past videos are ignored.
    const broadcasts=graph.filter(n=>n['@type']==='VideoObject' && n.publication?.['@type']==='BroadcastEvent');
    for (const node of broadcasts) {
      const embed=new URL(node.embedUrl.replaceAll('\\u0026','&'));
      if (embed.hostname!=='player.twitch.tv' || embed.searchParams.get('channel')?.toLowerCase()!==handle) return unknown();
      const event=node.publication, start=Date.parse(event.startDate), end=Date.parse(event.endDate);
      if (event.isLiveBroadcast===true && Number.isFinite(start) && start<=now+60000 && (!Number.isFinite(end)||end>now)) return {state:'live',title:String(node.description||node.name||'Live on Twitch').slice(0,240),startedAt:event.startDate};
      if (event.isLiveBroadcast!==false && !(Number.isFinite(end)&&end<=now)) return unknown();
    }
    return {state:'offline'};
  } catch { return unknown(); }
}

// Extract one JSON object without executing any page JavaScript.
export function assignedJson(html, name) {
  const marker=new RegExp(`(?:var\\s+)?${name}\\s*=\\s*`).exec(html);
  if (!marker) return null;
  const begin=marker.index+marker[0].length;
  if (html[begin]!=='{') return null;
  let depth=0, quoted=false, escape=false;
  for (let i=begin;i<html.length;i++) {
    const ch=html[i];
    if (quoted) { if (escape) escape=false; else if (ch==='\\') escape=true; else if (ch==='"') quoted=false; }
    else if (ch==='"') quoted=true;
    else if (ch==='{') depth++;
    else if (ch==='}' && --depth===0) { try { return JSON.parse(html.slice(begin,i+1)); } catch { return null; } }
  }
  return null;
}
export function parseYouTube(html) {
  const player=assignedJson(html,'ytInitialPlayerResponse');
  const live=player?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
  if (typeof live?.isLiveNow!=='boolean') return unknown();
  if (!live.isLiveNow) return {state:'offline'};
  if (player.playabilityStatus?.status!=='OK' || !/^[a-zA-Z0-9_-]{11}$/.test(player.videoDetails?.videoId)) return unknown();
  return {state:'live',title:String(player.videoDetails.title||'Live on YouTube').slice(0,240),videoId:player.videoDetails.videoId};
}
export function freshStreams(data, now=Date.now()) {
  const checked=Date.parse(data?.checkedAt);
  if (!Number.isFinite(checked) || now-checked>MAX_STATUS_AGE || checked-now>60000 || !Array.isArray(data.streams)) return [];
  return data.streams.filter(s=>s.state==='live');
}
