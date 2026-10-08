import { TIMERS, timerState, upcomingOccurrences, occurrencesOnDate, formatCountdown, formatTimerMoment, resolveTimeZone } from './timer-schedule.js';

const tabs = [...document.querySelectorAll('[role="tab"]')];
const panels = [...document.querySelectorAll('[role="tabpanel"]')];
const timerPanel = document.getElementById('timers');
let refreshTimers = () => {};

function selectTab(id) {
  for (const tab of tabs) {
    const selected = tab.getAttribute('aria-controls') === id;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of panels) panel.hidden = panel.id !== id;
  if (id === 'timers') refreshTimers();
}
function selectFromHash() {
  let hash = '';
  try { hash = decodeURIComponent(location.hash.slice(1)); } catch { /* Malformed fragment: use the default tab. */ }
  const target = document.getElementById(hash);
  // Campaign IDs are rendered asynchronously. An unknown fragment may be a saved event link.
  selectTab(hash === 'events' || target?.closest('#events') || (hash && !target) ? 'events' : 'timers');
}
for (const [index, tab] of tabs.entries()) {
  tab.addEventListener('click', () => {
    const id = tab.getAttribute('aria-controls');
    if (location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
    selectTab(id);
  });
  tab.addEventListener('keydown', event => {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : null;
    if (next === null) return;
    event.preventDefault();
    tabs[next].focus();
    tabs[next].click();
  });
}
window.addEventListener('hashchange', selectFromHash);
window.addEventListener('popstate', selectFromHash);
selectFromHash();

const timezone = document.getElementById('timer-timezone');
const preferenceKey = 'exalted-timer-timezone';
try {
  const saved = localStorage.getItem(preferenceKey);
  if ([...timezone.options].some(option => option.value === saved)) timezone.value = saved;
} catch { /* Timers still work with browser storage disabled. */ }
let zone = resolveTimeZone(timezone.value);
let slotsKey = '';
const categories = { pvp: 'PvP', field: 'Field event', activities: 'Activity' };
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function updateText(element, text) { if (element.textContent !== text) element.textContent = text; }
function updateTime(element, value, short = false) {
  element.dateTime = new Date(value).toISOString();
  updateText(element, formatTimerMoment(value, zone, short));
}

const activityCards = TIMERS.filter(timer => !['rift', 'daily-reset', 'weekly-reset'].includes(timer.id)).map(timer => {
  const card = node('article', 'field-timer-card');
  card.dataset.category = timer.category;
  const meta = node('div', 'field-card-meta');
  const status = node('span', 'field-status', 'Upcoming');
  meta.append(node('span', 'field-category', categories[timer.category]), status);
  const name = node('h3', '', timer.name);
  const description = node('p', 'field-description', timer.description);
  const label = node('p', 'countdown-label', 'NEXT WINDOW IN');
  const countdown = node('p', 'field-countdown');
  countdown.setAttribute('role', 'timer');
  countdown.setAttribute('aria-label', `${timer.name} countdown`);
  const time = node('time', 'field-next');
  const cadence = node('p', 'field-cadence', timer.cadence);
  card.append(meta, name, description, label, countdown, time, cadence);
  return { timer, card, status, label, countdown, time };
});
document.querySelector('[data-field-timers]').replaceChildren(...activityCards.map(item => item.card));
const filterStatus = document.querySelector('[data-timer-filter-status]');
for (const button of document.querySelectorAll('[data-timer-kind]')) {
  button.addEventListener('click', () => {
    for (const other of document.querySelectorAll('[data-timer-kind]')) other.setAttribute('aria-pressed', String(other === button));
    let count = 0;
    for (const item of activityCards) {
      item.card.hidden = button.dataset.timerKind !== 'all' && button.dataset.timerKind !== item.timer.category;
      if (!item.card.hidden) count++;
    }
    filterStatus.textContent = `${count} ${count === 1 ? 'timer' : 'timers'} shown`;
  });
}

const rift = TIMERS.find(timer => timer.id === 'rift');
const riftCountdown = document.querySelector('[data-rift-countdown]');
const riftNext = document.querySelector('[data-rift-next]');
const resetCards = [...document.querySelectorAll('[data-reset]')].map(card => ({
  timer: TIMERS.find(timer => timer.id === card.dataset.reset), countdown: card.querySelector('[data-countdown]'), time: card.querySelector('[data-next]'),
}));

function renderRiftSchedule(now, next) {
  const slots = occurrencesOnDate(rift, now, zone);
  const key = `${zone}/${slots[0]}/${next}`;
  if (key === slotsKey) return;
  slotsKey = key;
  document.querySelector('[data-timer-zone-label]').textContent = zone.replaceAll('_', ' ');
  document.querySelector('[data-rift-slots]').replaceChildren(...slots.map(start => {
    const slot = node('div', 'rift-slot');
    slot.dataset.state = start === next ? 'next' : start < now ? 'past' : 'upcoming';
    const time = node('time');
    updateTime(time, start, true);
    slot.append(time, node('span', '', start === next ? 'Next opening' : start < now ? 'Passed' : 'Upcoming'));
    return slot;
  }));
  document.querySelector('[data-upcoming-rifts]').replaceChildren(...upcomingOccurrences(rift, now).map((start, index) => {
    const item = node('li');
    const time = node('time');
    updateTime(time, start);
    item.append(node('span', 'rift-order', String(index + 1).padStart(2, '0')), time);
    return item;
  }));
}

function tick() {
  if (timerPanel.hidden || document.hidden) return;
  const now = Date.now();
  const next = timerState(rift, now).next;
  updateText(riftCountdown, formatCountdown(next - now));
  updateTime(riftNext, next);
  renderRiftSchedule(now, next);
  for (const item of resetCards) {
    const next = timerState(item.timer, now).next;
    updateText(item.countdown, formatCountdown(next - now));
    updateTime(item.time, next);
  }
  for (const item of activityCards) {
    const state = timerState(item.timer, now);
    const target = state.active?.end ?? state.next;
    item.card.dataset.active = String(Boolean(state.active));
    updateText(item.status, state.active ? 'Scheduled now' : 'Upcoming');
    updateText(item.label, state.active ? 'ESTIMATED WINDOW ENDS IN' : 'NEXT WINDOW IN');
    updateText(item.countdown, formatCountdown(target - now));
    updateTime(item.time, target);
  }
}
refreshTimers = tick;
timezone.addEventListener('change', () => {
  zone = resolveTimeZone(timezone.value);
  try { localStorage.setItem(preferenceKey, timezone.value); } catch { /* Preference persistence is optional. */ }
  tick();
});
document.querySelector('[data-timer-loading]').hidden = true;
document.querySelector('[data-timer-dashboard]').hidden = false;
document.querySelector('[data-field-section]').hidden = false;
tick();
setInterval(tick, 1000);
document.addEventListener('visibilitychange', tick);
