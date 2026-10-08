import directory from '../creators.json' with {type:'json'};
import { validateCreators, accountKey } from '../creator-directory.js';
import { parseTwitch, parseYouTube } from '../creator-status-data.js';

export async function getStatuses(data, fetcher=fetch, now=Date.now) {
  const accounts=[...new Map(validateCreators(data).creators.flatMap(c=>c.accounts).filter(a=>['twitch','youtube','kick'].includes(a.platform)).map(a=>[accountKey(a),a])).values()];
  const deadline=AbortSignal.timeout(9000);
  const results=new Array(accounts.length);
  let next=0;
  async function worker() {
    while (next<accounts.length) {
      const index=next++, account=accounts[index];
      let status={state:'unknown'};
      if (index<100 && !deadline.aborted && account.platform!=='kick') {
        try {
          const response=await fetcher(account.platform==='twitch'?account.url:account.url+'/live', {headers:{accept:'text/html','cache-control':'no-cache'},signal:deadline,redirect:'follow'});
          const finalHost=response.url?new URL(response.url).hostname:'';
          if (!response.ok || (finalHost && !['www.twitch.tv','twitch.tv','www.youtube.com','youtube.com'].includes(finalHost))) throw Error('Provider unavailable');
          const html=await response.text();
          if (html.length>4000000) throw Error('Provider response too large');
          status=account.platform==='twitch'?parseTwitch(html,account.handle,now()):parseYouTube(html);
        } catch { /* An outage must not masquerade as offline. */ }
      }
      results[index]={key:accountKey(account),...account,...status};
    }
  }
  await Promise.all(Array.from({length:Math.min(4,accounts.length)},worker));
  return {checkedAt:new Date(now()).toISOString(),streams:results};
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method && req.method!=='GET') { res.setHeader('Allow','GET'); return res.status(405).json({error:'Use GET'}); }
  try {
    const result=await getStatuses(directory);
    if (result.streams.every(s=>s.state!=='unknown')) res.setHeader('Cache-Control','public, max-age=0, s-maxage=30, must-revalidate');
    return res.status(200).json(result);
  } catch { return res.status(503).json({error:'Creator status unavailable',checkedAt:new Date().toISOString(),streams:[]}); }
}
