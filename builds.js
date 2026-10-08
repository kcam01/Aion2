import { CLASSES, CATEGORIES, filterGuides, validateLibrary } from './guide-library.js';

const grid = document.querySelector('#guide-grid');
const search = document.querySelector('#guide-search');
const classSelect = document.querySelector('#guide-class');
const count = document.querySelector('#guide-count');
const empty = document.querySelector('#guide-empty');
const error = document.querySelector('#guide-error');
const filters = [...document.querySelectorAll('[data-category]')];
let library, category = 'all';

for (const name of CLASSES) classSelect.add(new Option(name, name));

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function externalLink(url, text) {
  const node = element('a', '', text);
  node.href = url; node.target = '_blank'; node.rel = 'noopener noreferrer';
  return node;
}
function card(link) {
  const article = element('article', 'guide-card');
  const head = element('div', 'guide-card-head');
  head.append(element('span', '', CATEGORIES[link.category]));
  const format = element('span', 'guide-format', link.format === 'video' ? '▷ Video' : link.format === 'tool' ? '◇ Tool' : '▤ Read');
  head.append(format);
  const title = element('h2'); title.append(externalLink(link.url, link.title));
  const tags = element('div', 'guide-tags');
  for (const text of [link.classes.length ? link.classes.join(' · ') : 'All classes', ...link.tags.slice(0, 2)]) tags.append(element('span', '', text));
  const foot = element('div', 'guide-card-foot');
  foot.append(element('span', 'guide-source', link.source));
  const action = externalLink(link.url, link.format === 'video' ? 'Watch video ↗' : link.format === 'tool' ? 'Open tool ↗' : 'Read guide ↗');
  action.setAttribute('aria-label', `${action.textContent.replace(' ↗', '')}: ${link.title} (opens in a new tab)`);
  foot.append(action);
  article.append(head, title, element('p', 'guide-card-description', link.description), tags, foot);
  return article;
}
function render() {
  if (!library) return;
  const results = filterGuides(library.links, { query: search.value, category, className: classSelect.value });
  grid.replaceChildren(...results.map(card));
  empty.hidden = results.length > 0;
  count.textContent = `${results.length} of ${library.links.length} resources`;
  for (const button of filters) button.setAttribute('aria-pressed', String(button.dataset.category === category));
}
async function load() {
  error.hidden = true; empty.hidden = true; count.textContent = 'Loading the library…';
  try {
    const response = await fetch('/builds.json', { cache: 'no-cache' });
    if (!response.ok) throw Error('Library unavailable');
    library = validateLibrary(await response.json());
    const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(library.updated_at));
    document.querySelector('#guide-updated').textContent = `Library updated ${date}`;
    render();
  } catch {
    grid.replaceChildren(); library = null; error.hidden = false; count.textContent = 'Library unavailable';
  }
}
search.addEventListener('input', render);
classSelect.addEventListener('change', render);
for (const button of filters) button.addEventListener('click', () => { category = button.dataset.category; render(); });
document.querySelector('#guide-clear').addEventListener('click', () => { search.value = ''; classSelect.value = 'all'; category = 'all'; render(); search.focus(); });
document.querySelector('#guide-retry').addEventListener('click', load);
load();
