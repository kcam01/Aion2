import { readFile } from 'node:fs/promises';
import { validateLibrary } from '../guide-library.js';

const origin = process.argv[2] || 'https://exalted-aion2.vercel.app';
const files = ['builds.html', 'builds.json', 'builds.js', 'builds.css', 'guide-library.js', 'guild.css'];
for (const file of files) {
  const response = await fetch(origin + '/' + (file === 'builds.html' ? 'builds' : file), { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error(`${file}: HTTP ${response.status}`);
  const actual = (await response.text()).replace(/\r\n/g, '\n');
  const expected = (await readFile(new URL('../' + file, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  if (actual !== expected) throw Error(`${file}: deployed content differs from local`);
  if (file === 'builds.json') validateLibrary(JSON.parse(actual));
}
for (const path of ['/', '/events']) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(20000) });
  if (!response.ok || !(await response.text()).includes('href="/builds"')) throw Error(`Builds navigation missing on ${path}`);
}
console.log('Builds & Guides: page, data, scripts, styles and navigation verified at ' + origin);
