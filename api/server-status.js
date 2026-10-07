import { Buffer } from 'node:buffer';
import { MAX_AGE_MS, SERVERS, SOURCE_URL, normalizeStatus, unknownStatus } from '../server-status-data.js';

// Public Svelte page serialization, verified against the tracker's client on 2026-10-06.
// Parse only data; never evaluate scripts from the source page.
export function decodeTracker(html) {
  const encoded = html.match(/\bpayload:"([A-Za-z0-9+/=]+)"/)?.[1];
  if (!encoded || encoded.length > 2000000) throw new Error('Tracker format unavailable');
  const bytes = Buffer.from(encoded.split('').reverse().join(''), 'base64');
  const key = [154,60,87,241,40,189,100,14];
  for(let i=0; i<bytes.length; i++) bytes[i] ^= key[i%key.length];
  return JSON.parse(bytes.toString('utf8'));
}

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
    const response = await fetch(SOURCE_URL, {headers:{accept:'text/html'},signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error('Tracker unavailable');
    const result = normalizeStatus(decodeTracker(await response.text()),serverId);
    if (result.creation==='unknown') return res.status(503).json(result);
    const ttl = Math.max(0,Math.min(20,Math.floor((Date.parse(result.observedAt)+MAX_AGE_MS-Date.now())/1000)));
    res.setHeader('Cache-Control',`public, max-age=0, s-maxage=${ttl}, must-revalidate`);
    return res.status(200).json(result);
  } catch {
    return res.status(503).json(unknownStatus(serverId));
  }
}
