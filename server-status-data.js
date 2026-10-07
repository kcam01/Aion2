export const SOURCE_URL = 'https://aion2.gaming.tools/server-status?region=NAE';
export const MAX_AGE_MS = 120000;
export const SERVERS = Object.freeze(Object.fromEntries([
  ...['Siel','Nezekan','Vaizel','Kaisinel','Yustiel','Ariel','Fregion','Meslamtaeda'].map((name,i)=>[String(1101+i),{name,faction:'Elyos'}]),
  ...['Israphel','Zikel','Triniel','Lumiel','Marchutan','Azphel','Ereshkigal','Beritra'].map((name,i)=>[String(2101+i),{name,faction:'Asmodian'}]),
]));

export function freshObservation(value, now = Date.now()) {
  if (typeof value !== 'string') return false;
  const age = now - Date.parse(value);
  return Number.isFinite(age) && age >= -5000 && age <= MAX_AGE_MS;
}

export function unknownStatus(serverId = '2106', now = Date.now()) {
  return {serverId, ...SERVERS[serverId], region:'NAE', regionName:'NA East',
    creation:'unknown', serverStatus:'unknown', observedAt:null,
    checkedAt:new Date(now).toISOString(), sourceUrl:SOURCE_URL, sourceName:'gaming.tools',
    message:'Live status is unavailable. Check the tracker or the in-game server list.'};
}

export function normalizeStatus(payload, serverId = '2106', now = Date.now()) {
  const result = unknownStatus(serverId, now);
  const regions = Array.isArray(payload?.regions) ? payload.regions.filter(r=>r?.code==='NAE') : [];
  if (regions.length !== 1 || !Array.isArray(regions[0].servers)) return result;
  const region = regions[0];
  const rows = region.servers.filter(s=>s && String(s.serverId)===serverId);
  if (rows.length !== 1) return result;
  const row = rows[0];
  if (row.region !== 'NAE' || row.name !== result.name || row.faction !== result.faction) return result;
  if (typeof row.observedAt === 'string' && Number.isFinite(Date.parse(row.observedAt))) result.observedAt = row.observedAt;
  if (!freshObservation(row.observedAt, now) || !['live','maintenance'].includes(region.state) ||
      !['live','maintenance'].includes(row.state)) return result;
  if (region.state==='maintenance' || row.state==='maintenance' || row.inMaintenance===true) {
    return {...result, serverStatus:'maintenance', creation:'unavailable', message:'Character creation is unavailable during maintenance.'};
  }
  if (typeof row.isRunning !== 'boolean' || typeof row.inMaintenance !== 'boolean') return result;
  result.serverStatus = row.isRunning ? 'online' : 'offline';
  if (!row.isRunning) return {...result, creation:'unavailable', message:'Character creation is unavailable while the server is offline.'};
  if (typeof row.creationBlocked !== 'boolean') return result;
  return {...result, creation:row.creationBlocked?'blocked':'open', message:row.creationBlocked?
    'New characters cannot currently be created on this server.':
    'The community tracker reports character creation open. Availability can change quickly.'};
}

export function statusView(data, now = Date.now()) {
  if (!data || data.region!=='NAE' || !SERVERS[data.serverId] || !freshObservation(data.observedAt,now)) {
    return {state:'unknown',creation:'Status unavailable',server:'Unknown',message:'Live status is unavailable. Check the tracker or the in-game server list.'};
  }
  const server = {online:'Online',offline:'Offline',maintenance:'Maintenance'}[data.serverStatus] || 'Unknown';
  if (server==='Offline' || server==='Maintenance') return {state:'unavailable',creation:server==='Offline'?'Unavailable while offline':'Unavailable during maintenance',server,message:'Try again when the server is online.'};
  if (server==='Online' && ['open','blocked'].includes(data.creation)) return {
    state:data.creation, creation:data.creation==='open'?'Open':'Blocked', server,
    message:data.creation==='open'?'New characters can be created. Availability can change quickly.':'New character creation is currently restricted.',
  };
  return {state:'unknown',creation:'Status unavailable',server,message:'Character creation could not be confirmed. Check the tracker or in-game server list.'};
}
