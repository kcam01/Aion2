import { members } from './members.js';

const grid = document.querySelector('[data-member-list]');
const template = document.querySelector('#member-card-template');
for (const [index, member] of members.entries()) {
  const card = template.content.firstElementChild.cloneNode(true);
  card.dataset.member = member.slug;
  const set = (selector, value) => { card.querySelector(selector).textContent = value; };
  set('.member-index', String(index + 1).padStart(2, '0'));
  set('[data-field="server"]', member.serverName);
  set('[data-field="class"]', member.className);
  set('.member-avatar>span', Array.from(member.name)[0]);
  set('h3 a', member.name);
  const profileUrl = '/member?name=' + encodeURIComponent(member.slug);
  for (const link of card.querySelectorAll('a')) link.href = profileUrl;
  card.querySelector('.profile-link').setAttribute('aria-label', 'View ' + member.name + ' profile');
  const portrait = card.querySelector('.member-avatar img');
  if (member.portrait) portrait.src = member.portrait;
  else portrait.remove();
  grid.append(card);
}
if (!members.length) grid.textContent = 'No approved character links yet. Follow START HERE in Discord to join the roster.';
document.querySelector('[data-member-summary]').textContent = `${members.length} approved ${members.length === 1 ? 'member' : 'members'}. Explore their characters, gear, and companions.`;
grid.setAttribute('aria-busy', 'false');

// A profile outage does not hide the rest of the approved roster.
for (const member of members) loadMember(member);

for (const img of document.querySelectorAll('.portrait-panel img, .member-avatar img')) {
  const fallback = () => { img.hidden = true; img.style.display = 'none'; };
  img.addEventListener('error', fallback, { once: true });
  if (img.complete && !img.naturalWidth) fallback();
}

async function loadMember(member) {
  const card = document.querySelector(`[data-member="${member.slug}"]`);
  if (!card) return;
  const field = name => card.querySelector(`[data-field="${name}"]`);
  try {
    const response = await fetch(`/api/aion2?type=info&member=${member.slug}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Profile unavailable');
    const data = await response.json();
    const profile = data.profile;
    if (!profile?.characterName) throw new Error('Missing profile');
    field('level').textContent = profile.characterLevel ?? '—';
    field('power').textContent = profile.combatPower == null ? '—' : Number(profile.combatPower).toLocaleString();
    field('class').textContent = profile.className || member.className;
    field('server').textContent = profile.serverName || member.serverName;
    field('title').textContent = profile.titleName || 'No displayed title';
    field('status').textContent = 'Live character data';
    field('status').dataset.state = 'ready';
  } catch {
    field('status').textContent = 'Stats temporarily unavailable';
    field('status').dataset.state = 'unavailable';
  }
}
