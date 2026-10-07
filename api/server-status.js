import { MAX_AGE_MS, SERVERS, normalizeStatus, unknownStatus } from '../server-status-data.js';

// Public query used by Questlog's server-status page. No login or token required.
const STATUS_API = 'https://questlog.gg/aion-2/api/trpc/serverStatus.getServerStatus';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'Use GET'});
  }
  const serverId = req.query?.server ?? '2106';
  if (typeof serverId !== 'string' || !Object.hasOwn(SERVERS,serverId)) {
    return res.status(400).json({error:'Choose a supported NA East server ID'});
  }
  try {
    const response = await fetch(STATUS_API, {headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error('Tracker unavailable');
    const result = normalizeStatus(await response.json(),serverId);
    if (result.creation==='unknown') return res.status(503).json(result);
    const ttl = Math.max(0,Math.min(20,Math.floor((Date.parse(result.observedAt)+MAX_AGE_MS-Date.now())/1000)));
    res.setHeader('Cache-Control',`public, max-age=0, s-maxage=${ttl}, must-revalidate`);
    return res.status(200).json(result);
  } catch {
    return res.status(503).json(unknownStatus(serverId));
  }
}
