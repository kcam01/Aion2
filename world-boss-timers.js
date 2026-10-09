import { timerState, formatCountdown, formatTimerMoment } from './timer-schedule.js';
import { WORLD_BOSSES, GARTUA_STORAGE_KEY, createGartuaRecord, readGartuaRecord, gartuaState } from './world-boss-schedule.js';

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function text(element, value) { if (element.textContent !== value) element.textContent = value; }
function time(element, value, zone) {
  element.dateTime = new Date(value).toISOString();
  text(element, formatTimerMoment(value, zone));
}
function localInputValue(value) {
  const date = new Date(value);
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function mountWorldBossTimers(section) {
  const grid = section.querySelector('[data-world-boss-grid]');
  const tracker = section.querySelector('[data-gartua]');
  const cards = WORLD_BOSSES.map(boss => {
    const card = node('article', 'field-timer-card boss-schedule-card');
    card.dataset.boss = boss.id;
    const meta = node('div', 'field-card-meta');
    meta.append(node('span', 'field-category', 'Global · Abyss'), node('span', 'field-status', 'Estimated'));
    const countdown = node('p', 'field-countdown');
    countdown.setAttribute('role', 'timer');
    countdown.setAttribute('aria-label', `${boss.name} estimated countdown`);
    const next = node('time', 'field-next');
    card.append(meta, node('h3', '', boss.name), node('p', 'field-description', 'Chaotic Lower Reshanta'), node('p', 'countdown-label', 'NEXT ESTIMATED SPAWN IN'), countdown, next, node('p', 'field-cadence', boss.cadence));
    grid.insertBefore(card, tracker);
    return { boss, countdown, next };
  });
  const form = tracker.querySelector('form');
  const input = tracker.querySelector('input');
  const status = tracker.querySelector('[data-gartua-status]');
  const countdown = tracker.querySelector('[data-gartua-countdown]');
  const label = tracker.querySelector('[data-gartua-label]');
  const next = tracker.querySelector('[data-gartua-next]');
  const last = tracker.querySelector('[data-gartua-last]');
  const clear = tracker.querySelector('[data-gartua-clear]');
  const feedback = tracker.querySelector('[data-gartua-feedback]');
  const storageNote = tracker.querySelector('[data-gartua-storage]');
  let record = null;
  let zone = 'America/Chicago';
  try { record = readGartuaRecord(localStorage.getItem(GARTUA_STORAGE_KEY)); }
  catch { storageNote.textContent = 'Storage unavailable. Kill times last for this visit only.'; }
  input.value = localInputValue(record?.killedAt ?? Date.now());
  tracker.querySelector('[data-device-zone]').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll('_', ' ');

  function updateGartua(now) {
    const state = gartuaState(record, now);
    tracker.dataset.state = state.status;
    text(status, state.status === 'untracked' ? 'Needs kill time' : state.status === 'elapsed' ? 'Check in game' : 'Estimated');
    text(label, state.status === 'untracked' ? 'RECORD A KILL TO START' : state.status === 'elapsed' ? 'ESTIMATED WINDOW PASSED' : 'ESTIMATED RESPAWN IN');
    text(countdown, state.status === 'untracked' ? '—' : state.status === 'elapsed' ? 'Check in game' : formatCountdown(state.next - now));
    next.hidden = !record;
    last.hidden = !record;
    clear.disabled = !record;
    if (record) {
      time(next, state.next, zone);
      text(last, `Last kill: ${formatTimerMoment(record.killedAt, zone)}`);
    }
  }
  function save(killedAt) {
    try { record = createGartuaRecord(killedAt); }
    catch (error) { feedback.textContent = error.message; return; }
    input.value = localInputValue(record.killedAt);
    try {
      localStorage.setItem(GARTUA_STORAGE_KEY, JSON.stringify(record));
      storageNote.textContent = 'Saved on this device for Azphel. Not shared with the guild.';
      feedback.textContent = 'Kill recorded. The 12-hour estimate is running.';
    } catch {
      storageNote.textContent = 'Storage unavailable. Kill times last for this visit only.';
      feedback.textContent = 'Kill recorded for this visit. It could not be saved on this device.';
    }
    updateGartua(Date.now());
  }
  tracker.querySelector('[data-gartua-killed]').addEventListener('click', () => save(Date.now()));
  form.addEventListener('submit', event => { event.preventDefault(); save(new Date(input.value).getTime()); });
  clear.addEventListener('click', () => {
    record = null;
    try { localStorage.removeItem(GARTUA_STORAGE_KEY); feedback.textContent = 'Kill time cleared.'; }
    catch { feedback.textContent = 'Cleared for this visit. Browser storage could not be updated.'; }
    updateGartua(Date.now());
  });
  window.addEventListener('storage', event => {
    if (event.key !== GARTUA_STORAGE_KEY && event.key !== null) return;
    record = readGartuaRecord(event.newValue);
    if (record) input.value = localInputValue(record.killedAt);
    updateGartua(Date.now());
  });
  section.hidden = false;
  return (now, selectedZone) => {
    zone = selectedZone;
    for (const card of cards) {
      const target = timerState(card.boss, now).next;
      text(card.countdown, formatCountdown(target - now));
      time(card.next, target, zone);
    }
    updateGartua(now);
  };
}
