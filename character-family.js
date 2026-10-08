// Navigation uses the validated public roster, so it remains usable during a profile outage.
export function renderCharacterFamily(container, family, currentSlug) {
  container.replaceChildren();
  container.hidden = !family?.alts.length;
  if (container.hidden) return;
  const {main, alts} = family;
  const isMain = currentSlug === main.slug;
  const create = (tag, className, text = '') => {
    const node = container.ownerDocument.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  const heading = create('div', 'family-heading');
  const title = create('h2', '', isMain ? 'Alts' : 'Linked characters');
  title.id = 'character-family-title';
  const note = create('p', '', isMain ? 'Select a portrait to explore their character sheet.' : 'Alternate character of ');
  if (!isMain) {
    const back = create('a', 'family-main-link', main.name);
    back.href = '/member?name=' + encodeURIComponent(main.slug);
    note.append(back);
  }
  heading.append(title, note);
  const list = create('ul', 'family-list');
  for (const character of isMain ? alts : [main, ...alts]) {
    const item = create('li', '');
    const link = create('a', 'family-character');
    const role = character.slug === main.slug ? 'Main' : 'Alt';
    link.href = '/member?name=' + encodeURIComponent(character.slug);
    link.setAttribute('aria-label', `${character.name}, ${role.toLowerCase()}, ${character.className} on ${character.serverName}`);
    if (character.slug === currentSlug) link.setAttribute('aria-current', 'page');
    const portrait = create('span', 'family-portrait');
    portrait.setAttribute('aria-hidden', 'true');
    portrait.append(create('span', 'family-initial', Array.from(character.name)[0]));
    if (character.portrait) {
      const image = create('img', '');
      image.alt = ''; image.width = 64; image.height = 64; image.loading = 'lazy';
      image.addEventListener('error', () => { image.hidden = true; }, {once:true});
      image.src = character.portrait;
      portrait.append(image);
    }
    link.append(portrait, create('strong', 'family-name', character.name), create('span', 'family-class', character.className));
    if (!isMain) link.append(create('small', 'family-role', character.slug === currentSlug ? 'Viewing' : role));
    item.append(link); list.append(item);
  }
  container.append(heading, list);
}
