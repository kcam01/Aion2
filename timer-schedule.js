// Recurrence facts transcribed from Aion2Hub's Global schedule, not game telemetry.
export const TIMER_SOURCE = Object.freeze({
  url: 'https://aion2hub.com/tools/event-timer',
  checkedOn: '2026-10-08',
  clientDate: '2026-09-19',
  offsetMinutes: 540,
  region: 'North America',
});

const everyDay = [0, 1, 2, 3, 4, 5, 6];
const hourly = Array.from({ length: 24 }, (_, hour) => hour * 60);
function activity(id, name, category, durationSeconds, description) {
  return { id, name, category, days: everyDay, minutes: hourly, durationSeconds, description, cadence: 'Every hour' };
}

export const TIMERS = [
  { id: 'rift', name: 'Spacetime Rift', category: 'pvp', days: everyDay, minutes: [0, 180, 360, 540, 720, 900, 1080, 1260], durationSeconds: 0, cadence: 'Every 3 hours' },
  { id: 'daily-reset', name: 'Daily reset', category: 'reset', days: everyDay, minutes: [960], durationSeconds: 0, cadence: 'Every day' },
  { id: 'weekly-reset', name: 'Weekly reset', category: 'reset', days: [3], minutes: [960], durationSeconds: 0, cadence: 'Every Wednesday · server clock' },
  { id: 'abyss', name: 'Abyss Event', category: 'pvp', days: [1, 4, 6], minutes: [1260], durationSeconds: 600, cadence: 'Mon / Thu / Sat · server clock', description: 'A scheduled battle in the Abyss.' },
  { id: 'air-raid', name: 'Beritra Air Raid', category: 'field', days: everyDay, minutes: hourly.map(minute => minute + 30), durationSeconds: 780, cadence: 'Every hour · half past', description: 'Shared slot with Accursed Sword and Incursion of the Spirits; the activity may rotate.' },
  activity('shugo-merchants', 'Defend Shugo Merchants', 'field', 480, 'Rally for a merchant defense.'),
  activity('goldrin', 'Goldrin’s Treasure', 'activities', 410, 'A treasure-hunting challenge.'),
  activity('hidden-lugi', 'Hidden Lugi', 'activities', 390, 'A hide-and-seek challenge.'),
  activity('jump-jump', 'Jump Jump', 'activities', 355, 'A timed jumping challenge.'),
  activity('mysterious-track', 'Mysterious Track', 'activities', 480, 'Race against the clock.'),
  activity('tile', 'Not This Tile?', 'activities', 375, 'Pick your next step carefully.'),
  activity('nyerk-shooter', 'Nyerk Shooter', 'activities', 330, 'Put your aim to the test.'),
  activity('odyle', 'Odyle Flight Frenzy', 'activities', 390, 'Take to the skies.'),
  activity('shugo-dilemma', 'Shugo’s Dilemma', 'activities', 480, 'A platforming challenge with a twist.'),
  activity('up-up-up', 'Up! Up! Up!', 'activities', 480, 'Keep climbing.'),
  activity('wraith', 'Wraith Evasion', 'activities', 480, 'Stay ahead of the wraiths.'),
];

const DAY = 86400000;
const OFFSET = TIMER_SOURCE.offsetMinutes * 60000;
function occurrences(timer, now, before, after) {
  const sourceDay = Math.floor((Number(now) + OFFSET) / DAY) * DAY;
  const result = [];
  for (let day = -before; day <= after; day++) {
    const midnight = sourceDay + day * DAY;
    if (!timer.days.includes(new Date(midnight).getUTCDay())) continue;
    for (const minute of timer.minutes) result.push(midnight + minute * 60000 - OFFSET);
  }
  return result.sort((a, b) => a - b);
}

export function timerState(timer, now = Date.now()) {
  now = Number(now);
  const starts = occurrences(timer, now, 1, 8);
  const duration = timer.durationSeconds * 1000;
  const start = starts.find(start => duration > 0 && start <= now && now < start + duration);
  return { active: start === undefined ? null : { start, end: start + duration }, next: starts.find(start => start >= now) };
}

export function upcomingOccurrences(timer, now = Date.now(), count = 6) {
  return occurrences(timer, now, 0, Math.max(8, count * 7)).filter(start => start >= Number(now)).slice(0, count);
}

const dateFormats = new Map();
function dateKey(value, timeZone) {
  if (!dateFormats.has(timeZone)) dateFormats.set(timeZone, new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }));
  return dateFormats.get(timeZone).format(value);
}

// Filter actual instants by their displayed calendar day. Never assume a local day is 24 hours.
export function occurrencesOnDate(timer, now = Date.now(), timeZone = 'America/Chicago') {
  const key = dateKey(now, timeZone);
  return occurrences(timer, now, 2, 2).filter(start => dateKey(start, timeZone) === key);
}

export function resolveTimeZone(preference, localZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const zone = preference === 'local' ? localZone : preference;
  if (typeof zone !== 'string' || !zone) return 'America/Chicago';
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(); return zone; }
  catch { return 'America/Chicago'; }
}

const momentFormats = new Map();
export function formatTimerMoment(value, timeZone, short = false) {
  const key = `${timeZone}/${short}`;
  if (!momentFormats.has(key)) momentFormats.set(key, new Intl.DateTimeFormat('en-US', {
    timeZone, ...(short ? {} : { weekday: 'short', month: 'short', day: 'numeric' }),
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }));
  return momentFormats.get(key).format(value);
}

export function formatCountdown(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(seconds / 86400);
  const clock = [Math.floor(seconds % 86400 / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(part => String(part).padStart(2, '0')).join(':');
  return `${days ? `${days}d ` : ''}${clock}`;
}
