// Community estimates, checked 2026-10-09. These are not live server observations.
export const WORLD_BOSS_SOURCE = Object.freeze({
  url: 'https://aion2hub.com/tools/world-bosses',
  checkedOn: '2026-10-09', clientDate: '2026-09-19', offsetMinutes: 540,
});

export const WORLD_BOSSES = [
  { id: 'watcher-kaira', name: 'Watcher Kaira', days: [0, 1, 2, 3, 4, 5, 6], minutes: [60, 240, 420, 600, 780, 960, 1140, 1320], durationSeconds: 0, cadence: 'Every 3 hours · from 01:00 GMT+9' },
  ...['Argo', 'Kaira', 'Tamasa'].map(name => ({
    id: `executor-${name.toLowerCase()}`, name: `Executor ${name}`, days: [1, 4, 6], minutes: [1290], durationSeconds: 0,
    cadence: 'Mon / Thu / Sat · 21:30 GMT+9',
  })),
  { id: 'abyss-siege-boss', name: 'Abyss Siege Boss', days: [0, 5], minutes: [1260], durationSeconds: 0, cadence: 'Fri / Sun · 21:00 GMT+9' },
];

export const GARTUA = Object.freeze({
  id: 'immortal-gartua', server: 'Azphel', respawnHours: 12,
  source: 'https://aion2guidance.com/en/bosses/', checkedOn: '2026-10-09',
});
export const GARTUA_STORAGE_KEY = 'exalted-boss-azphel-immortal-gartua-v1';

export function createGartuaRecord(killedAt, now = Date.now()) {
  if (typeof killedAt !== 'number' || !Number.isFinite(killedAt) || killedAt <= 0 || killedAt > now) {
    throw new Error('Enter a valid kill time that is not in the future.');
  }
  return { version: 1, boss: GARTUA.id, server: GARTUA.server, killedAt };
}

export function readGartuaRecord(raw, now = Date.now()) {
  try {
    const record = JSON.parse(raw);
    if (record?.version !== 1 || record.boss !== GARTUA.id || record.server !== GARTUA.server) return null;
    return createGartuaRecord(record.killedAt, now);
  } catch { return null; }
}

export function gartuaState(record, now = Date.now()) {
  if (!record) return { status: 'untracked', next: null };
  const next = record.killedAt + GARTUA.respawnHours * 3600000;
  return { status: next > now ? 'counting' : 'elapsed', next };
}
