export const TIME_ZONE = 'America/Chicago';
export const KINDS = { drops: 'Twitch Drops', 'in-game': 'In-game', community: 'Community' };
export const LABELS = { ending: 'Ends within 24 hours', live: 'Open', upcoming: 'Upcoming', scheduled: 'Published window · check times', claim: 'Claim earned rewards', ended: 'Ended', 'past-window': 'Published window passed' };
const DAY = 86400000;
const dateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const moment = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) && dateOnly(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 1600;

export function safeSource(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
    return (url.hostname === 'aion2.plaync.com' && url.pathname.startsWith('/en-us')) ||
      (url.hostname === 'steamcommunity.com' && url.pathname.startsWith('/games/3393110/announcements/')) ||
      (url.hostname === 'store.steampowered.com' && url.pathname.startsWith('/news/app/3393110/')) ||
      ['warforatreia.com', 'www.warforatreia.com', 'www.twitch.tv', 'twitch.tv', 'help.twitch.tv'].includes(url.hostname);
  } catch { return false; }
}

export function validateSchedule(data) {
  const fail = message => { throw new Error(`Invalid event schedule: ${message}`); };
  if (data?.schema_version !== 1 || !moment(data.verified_at) || !Array.isArray(data.events)) fail('manifest');
  const ids = new Set();
  for (const event of data.events) {
    if (!event || typeof event.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,100}$/.test(event.id) || ids.has(event.id)) fail('event ID');
    ids.add(event.id);
    if (!Object.hasOwn(KINDS, event.kind)) fail(`${event.id} category`);
    for (const key of ['title', 'summary', 'participation']) if (!text(event[key])) fail(`${event.id} ${key}`);
    for (const key of ['timing_note', 'claim_label']) if (event[key] !== undefined && !text(event[key])) fail(`${event.id} ${key}`);
    if (!Array.isArray(event.rewards) || !event.rewards.every(text)) fail(`${event.id} rewards`);
    if (event.details !== undefined && (!Array.isArray(event.details) || !event.details.every(text))) fail(`${event.id} details`);
    if (!safeSource(event.source_url) || (event.action_url !== undefined && !safeSource(event.action_url))) fail(`${event.id} source URL`);
    if (!dateOnly(event.start_date) || !dateOnly(event.end_date) || event.end_date < event.start_date) fail(`${event.id} date window`);
    for (const key of ['starts_at', 'ends_at', 'claim_by']) if (event[key] !== undefined && !moment(event[key])) fail(`${event.id} ${key}`);
    if (event.confirmed_open !== undefined && typeof event.confirmed_open !== 'boolean') fail(`${event.id} confirmation`);
    if (event.starts_at && event.ends_at && Date.parse(event.ends_at) <= Date.parse(event.starts_at)) fail(`${event.id} reversed times`);
    if (event.claim_by && event.ends_at && Date.parse(event.claim_by) <= Date.parse(event.ends_at)) fail(`${event.id} claim deadline`);
  }
  return data;
}

function calendarDay(now, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function statusFor(event, now = new Date()) {
  // Date-only ranges are archived only when the date has passed in every time zone.
  const expired = event.ends_at ? now.getTime() >= Date.parse(event.ends_at) : calendarDay(now, 'Etc/GMT+12') > event.end_date;
  if (expired) {
    if (event.claim_by && now.getTime() < Date.parse(event.claim_by)) return 'claim';
    return event.ends_at ? 'ended' : 'past-window';
  }
  if (event.starts_at ? now.getTime() < Date.parse(event.starts_at) : calendarDay(now, TIME_ZONE) < event.start_date) return 'upcoming';
  if (event.starts_at || event.confirmed_open) {
    return event.ends_at && Date.parse(event.ends_at) - now.getTime() <= DAY ? 'ending' : 'live';
  }
  return 'scheduled';
}

export function selectEvents(events, { now = new Date(), kind = 'all', section = 'schedule', limit = Infinity } = {}) {
  const sectionFor = status => status === 'claim' ? 'claim' : ['ended', 'past-window'].includes(status) ? 'archive' : 'schedule';
  const priority = event => statusFor(event, now) === 'ending' ? 0 : 1;
  const milestone = event => {
    const status = statusFor(event, now);
    if (status === 'claim') return event.claim_by;
    if (status === 'upcoming') return event.starts_at || event.start_date;
    return event.ends_at || event.end_date;
  };
  return events.filter(event => (kind === 'all' || event.kind === kind) && sectionFor(statusFor(event, now)) === section)
    .sort((a, b) => priority(a) - priority(b) || (section === 'archive' ? -1 : 1) * (Date.parse(milestone(a)) - Date.parse(milestone(b))) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function formatMoment(value) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));
}
export function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`));
}
export function isStale(verifiedAt, now = new Date()) { return now.getTime() - Date.parse(verifiedAt) > 2 * DAY; }
