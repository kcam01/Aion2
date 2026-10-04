import { KINDS, LABELS, validateSchedule, statusFor, selectEvents, formatMoment, formatDate, isStale } from './event-schedule.js';

const fullPage = document.querySelector('[data-events-page]');
const preview = document.querySelector('[data-events-preview]');
const freshness = document.querySelector('[data-event-freshness]');
const warning = document.querySelector('[data-event-warning]');
let schedule, selectedKind = 'all', renderedKey = '', loadFailed = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function link(label, href) {
  const node = element('a', 'profile-link', label);
  node.href = href;
  return node;
}
function time(value, exact) {
  const node = element('time', '', exact ? formatMoment(value) : formatDate(value));
  node.dateTime = value;
  return node;
}
function dateLine(list, label, value, exact = true) {
  const row = element('div');
  const description = element('dd');
  description.append(time(value, exact));
  row.append(element('dt', '', label), description);
  list.append(row);
}
function renderCard(event, compact, now) {
  const status = statusFor(event, now);
  const card = element('article', compact ? 'event-preview-card' : 'event-card');
  card.dataset.status = status;
  card.dataset.eventId = event.id;
  if (!compact) card.id = event.id;
  const meta = element('div', 'event-meta');
  meta.append(element('span', 'event-kind', KINDS[event.kind]), element('span', 'event-badge', LABELS[status]));
  const body = element('div', 'event-body');
  const title = element('h3');
  if (compact) title.append(link(event.title, `/events#${event.id}`));
  else title.textContent = event.title;
  body.append(title, element('p', 'event-summary', event.summary));
  const dates = element('dl', 'event-dates');
  if (!compact) {
    const row = element('div');
    const window = element('dd');
    window.append(time(event.start_date, false), ' – ', time(event.end_date, false));
    row.append(element('dt', '', 'Published dates'), window);
    dates.append(row);
    if (event.starts_at) dateLine(dates, 'Opens', event.starts_at);
  }
  if (event.ends_at) dateLine(dates, event.kind === 'drops' ? 'Watch deadline' : 'Participation deadline', event.ends_at);
  else if (compact) {
    dateLine(dates, status === 'upcoming' ? 'Starts on · time TBD' : 'Final published date · time TBD', status === 'upcoming' ? event.start_date : event.end_date, false);
  }
  if (!compact && event.claim_by) dateLine(dates, event.claim_label || 'Claim earned Drops by', event.claim_by);
  body.append(dates);
  if (!compact) {
    if (event.timing_note) body.append(element('p', 'event-timing-note', event.timing_note));
    const details = element('details', 'event-details');
    details.append(element('summary', '', 'Rewards & participation'));
    if (event.rewards.length) {
      details.append(element('h4', '', 'Reward highlights'));
      const rewards = element('ul');
      for (const reward of event.rewards) rewards.append(element('li', '', reward));
      details.append(rewards);
    }
    if (event.details?.length) {
      details.append(element('h4', '', 'Published phases'));
      const phases = element('ul');
      for (const phase of event.details) phases.append(element('li', '', phase));
      details.append(phases);
    }
    details.append(element('h4', '', ['ended', 'past-window', 'claim'].includes(status) ? 'Participation during the event' : 'How to take part'), element('p', '', event.participation));
    body.append(details);
    const actions = element('div', 'event-actions');
    actions.append(link('Official announcement ↗', event.source_url));
    if (status === 'claim' && event.kind === 'drops') actions.append(link('Claim in Twitch inventory ↗', 'https://www.twitch.tv/drops/inventory'));
    else if (event.action_url && !['ended', 'past-window'].includes(status)) actions.append(link(event.kind === 'drops' ? 'Check campaign ↗' : 'Event details ↗', event.action_url));
    body.append(actions);
  }
  card.append(meta, body);
  return card;
}

function render() {
  if (!schedule) return;
  const now = new Date();
  const stale = isStale(schedule.verified_at, now);
  const key = JSON.stringify([schedule, selectedKind, stale, loadFailed, schedule.events.map(event => statusFor(event, now))]);
  if (key === renderedKey) return;
  renderedKey = key;
  freshness.textContent = `Sources checked ${formatMoment(schedule.verified_at)} · Confirmed times are Central.`;
  warning.hidden = !stale && !loadFailed;
  warning.textContent = loadFailed ? 'Couldn’t refresh the schedule. Showing the last loaded version; check the official links for changes.' : stale ? 'This schedule hasn’t been verified in over 48 hours. Check the official links before making plans.' : '';
  if (preview) {
    const events = selectEvents(schedule.events, { now, limit: 3 });
    preview.replaceChildren(...events.map(event => renderCard(event, true, now)));
    if (!events.length) preview.append(element('p', 'schedule-empty', 'No current or upcoming events are listed. Open the full schedule for reward claims and official sources.'));
    preview.setAttribute('aria-busy', 'false');
  }
  if (fullPage) {
    for (const section of ['schedule', 'claim', 'archive']) {
      const events = selectEvents(schedule.events, { now, kind: selectedKind, section });
      const container = document.querySelector(`[data-event-list="${section}"]`);
      container.replaceChildren(...events.map(event => renderCard(event, false, now)));
      container.setAttribute('aria-busy', 'false');
      if (section === 'schedule') {
        document.querySelector('[data-event-count]').textContent = `${events.length} ${events.length === 1 ? 'event' : 'events'}`;
        if (!events.length) container.append(element('p', 'schedule-empty', 'No current or upcoming events in this category. Check the claim section and official sources below.'));
      } else {
        document.querySelector(`[data-${section}-section]`).hidden = events.length === 0;
        if (section === 'archive') document.querySelector('[data-archive-count]').textContent = `(${events.length})`;
      }
    }
  }
}

async function loadSchedule() {
  try {
    const response = await fetch('/events.json', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Schedule unavailable');
    schedule = validateSchedule(await response.json());
    loadFailed = false;
    render();
  } catch {
    loadFailed = true;
    if (schedule) render();
    else {
      freshness.textContent = 'Schedule temporarily unavailable.';
      warning.hidden = false;
      warning.textContent = 'Please try again shortly or use the official announcements and Twitch links.';
      (preview || document.querySelector('[data-event-list="schedule"]')).setAttribute('aria-busy', 'false');
    }
  }
}

if (fullPage || preview) {
  for (const button of document.querySelectorAll('[data-kind]')) {
    button.addEventListener('click', () => {
      selectedKind = button.dataset.kind;
      for (const other of document.querySelectorAll('[data-kind]')) other.setAttribute('aria-pressed', String(other === button));
      render();
    });
  }
  await loadSchedule();
  // Resolve a homepage deep link after the manifest has rendered its target.
  let target;
  try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch { /* Ignore a malformed URL fragment. */ }
  if (target && fullPage) {
    const archive = target.closest('details.event-archive');
    if (archive) archive.open = true;
    target.scrollIntoView();
  }
  setInterval(render, 60000);
  setInterval(loadSchedule, 300000);
}
