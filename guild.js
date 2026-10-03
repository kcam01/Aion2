import { members } from './members.js';

// Each member loads independently so an unavailable profile cannot hide the other.
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
