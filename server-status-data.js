export const SOURCE_URL = 'https://questlog.gg/aion-2/en/server-status';
export const MAX_AGE_MS = 300000;
// Questlog reports five-minute timestamps that can lead the response clock.
// Preserve them verbatim and label them approximate in both consumers.
export const MAX_CLOCK_SKEW_MS = 300000;
export const SERVERS = Object.freeze(Object.fromEntries([
  ...['Siel','Nezekan','Vaizel','Kaisinel','Yustiel','Ariel','Fregion','Meslamtaeda'].map((name,i)=>[String(1101+i),{name,faction:'Elyos'}]),
  ...['Israphel','Zikel','Triniel','Lumiel','Marchutan','Azphel','Ereshkigal','Beritra'].map((name,i)=>[String(2101+i),{name,faction:'Asmodian'}]),
]));

export function freshObservation(value, now = Date.now()) {
  if (typeof value !== 'string') return false;
  const age = now - Date.parse(value);
  return Number.isFinite(age) && age >= -MAX_CLOCK_SKEW_MS && age <= MAX_AGE_MS;
}

export function unknownStatus(serverId = '2106', now = Date.now()) {
  return {serverId, ...SERVERS[serverId], region:'NAE', regionName:'NA East',
    creation:'unknown', serverStatus:'unknown', observedAt:null,
    checkedAt:new Date(now).toISOString(), sourceUrl:SOURCE_URL, sourceName:'Questlog',
    message:'Live status is unavailable. Check the tracker or the in-game server list.'};
}

export function normalizeStatus(payload, serverId = '2106', now = Date.now()) {
  const result = unknownStatus(serverId, now);
  const servers = payload?.result?.data?.servers;
  if (!Array.isArray(servers)) return result;
  const rows = servers.filter(s=>s?.region==='nae' && String(s.serverId)===serverId);
  if (rows.length !== 1) return result;
  const row = rows[0];
  const race = result.faction==='Asmodian' ? 2 : 1;
  if (row.name !== result.name || row.race !== race) return result;
  if (typeof row.updatedAt === 'string' && Number.isFinite(Date.parse(row.updatedAt))) result.observedAt = row.updatedAt;
  if (!freshObservation(row.updatedAt, now)) return result;
  if (typeof row.isRunning !== 'boolean' || typeof row.inMaintenance !== 'boolean') return result;
  if (row.inMaintenance) {
    return {...result, serverStatus:'maintenance', creation:'unavailable', message:'Character creation is unavailable during maintenance.'};
  }
  result.serverStatus = row.isRunning ? 'online' : 'offline';
  if (!row.isRunning) return {...result, creation:'unavailable', message:'Character creation is unavailable while the server is offline.'};
  // Questlog's published client uses tag bit 4 for character-creation locks.
  // Missing or coerced flags must never be interpreted as an unset lock.
  if (!Number.isInteger(row.tags) || row.tags < 0 || row.tags > 0xffffffff) return result;
  const blocked = (row.tags & 4)!==0;
  return {...result, creation:blocked?'blocked':'open', message:blocked?
    'New characters cannot currently be created on this server.':
    'Questlog reports character creation open. Availability can change quickly.'};
}

export function statusView(data, now = Date.now()) {
  if (!data || data.region!=='NAE' || !SERVERS[data.serverId] || !freshObservation(data.observedAt,now)) {
    return {state:'unknown',creation:'Status unavailable',server:'Unknown',message:'Live status is unavailable. Check the tracker or the in-game server list.'};
  }
  const server = {online:'Online',offline:'Offline',maintenance:'Maintenance'}[data.serverStatus] || 'Unknown';
  if (server==='Offline' || server==='Maintenance') return {state:'unavailable',creation:server==='Offline'?'Unavailable while offline':'Unavailable during maintenance',server,message:'Try again when the server is online.'};
  if (server==='Online' && ['open','blocked'].includes(data.creation)) return {
    state:data.creation, creation:data.creation==='open'?'Open':'Blocked', server,
    message:data.creation==='open'?'Questlog reports character creation open. Availability can change quickly.':'Questlog reports new character creation restricted.',
  };
  return {state:'unknown',creation:'Status unavailable',server,message:'Character creation could not be confirmed. Check the tracker or in-game server list.'};
}
