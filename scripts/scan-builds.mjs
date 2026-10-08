// Read-only Discord scan. Credentials and scan receipts stay outside deployment.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLibrary, canonicalGuideUrl } from '../guide-library.js';
import { readChannelHistory, collectGuideLinks } from './builds-scan-core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const privateDir = join(root, 'output', 'builds-monitor');
const guildId = '1556392756836966481', channelId = '1556395669348942025';
const origin = 'https://exalted-aion2.vercel.app';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
let token;

async function json(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}
async function save(name, data) {
  await mkdir(privateDir, { recursive: true });
  const path = join(privateDir, name);
  await writeFile(path + '.tmp', JSON.stringify(data, null, 2) + '\n');
  await rename(path + '.tmp', path);
}
async function discord(route) {
  if (!token) {
    const tokenFile = process.env.AION_DISCORD_TOKEN_FILE || join(homedir(), '.codex', 'mcp', 'discord', 'bot-token.dpapi');
    try {
      token = execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; $s=Get-Content -LiteralPath $env:AION_DISCORD_TOKEN_FILE -Raw | ConvertTo-SecureString; $c=[PSCredential]::new('DiscordBot',$s); [Console]::Write($c.GetNetworkCredential().Password); $s.Dispose()"], { encoding: 'utf8', windowsHide: true, timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, AION_DISCORD_TOKEN_FILE: tokenFile, PSModulePath: 'C:/Windows/System32/WindowsPowerShell/v1.0/Modules' } }).trim();
    } catch { throw Error('Discord credential could not be loaded from the private DPAPI store'); }
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch('https://discord.com/api/v10' + route, { headers: { Authorization: 'Bot ' + token }, signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    if (response.status === 429 && attempt < 3 && Number(result.retry_after) <= 30) { await new Promise(done => setTimeout(done, Number(result.retry_after) * 1000 + 300)); continue; }
    if (!response.ok) throw Error(`Discord read failed: HTTP ${response.status}`);
    return result;
  }
}
async function scan() {
  const channel = await discord(`/channels/${channelId}`);
  if (channel.guild_id !== guildId || channel.type !== 0 || channel.name !== 'builds-and-guides') throw Error('Unexpected Discord channel; scan stopped');
  const messages = await readChannelHistory(before => discord(`/channels/${channelId}/messages?limit=100${before ? '&before=' + before : ''}`));
  const links = collectGuideLinks(messages);
  const library = validateLibrary(await json(join(root, 'builds.json')));
  const ignored = await json(join(privateDir, 'ignored.json'), {});
  const checkpoint = await json(join(privateDir, 'checkpoint.json'), {});
  const known = new Set(library.links.map(link => link.url));
  const candidates = links.filter(link => !known.has(link.url) && !ignored[link.url]);
  const missing = library.links.filter(link => !links.some(shared => shared.url === link.url)).map(link => ({ id: link.id, url: link.url }));
  const snapshot = { version: 1, channel_id: channelId, scanned_at: new Date().toISOString(), message_count: messages.length, links, candidates, missing };
  snapshot.fingerprint = digest(links);
  await save('pending.json', snapshot);
  console.log(JSON.stringify({ scanned_at: snapshot.scanned_at, message_count: messages.length, unique_links: links.length, changed_since_checkpoint: snapshot.fingerprint !== checkpoint.fingerprint, candidates, missing }, null, 2));
}
async function acknowledge() {
  const pending = await json(join(privateDir, 'pending.json'));
  if (pending.channel_id !== channelId || pending.fingerprint !== digest(pending.links)) throw Error('Invalid pending scan');
  const ignored = await json(join(privateDir, 'ignored.json'), {});
  const local = validateLibrary(await json(join(root, 'builds.json')));
  const response = await fetch(origin + '/builds.json', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok || digest(await response.json()) !== digest(local)) throw Error('Live guide library does not match local data; checkpoint unchanged');
  const known = new Set(local.links.map(link => link.url));
  if (pending.links.some(link => !known.has(link.url) && !ignored[link.url])) throw Error('Unreviewed links remain; checkpoint unchanged');
  await save('checkpoint.json', { version: 1, channel_id: channelId, fingerprint: pending.fingerprint, scanned_at: pending.scanned_at, acknowledged_at: new Date().toISOString(), published_hash: digest(local), unique_links: pending.links.length });
  console.log(JSON.stringify({ acknowledged: true, published_links: local.links.length, scanned_at: pending.scanned_at }));
}
async function ignore(url, reason) {
  const canonical = canonicalGuideUrl(url);
  if (!canonical || !reason?.trim()) throw Error('Provide a public URL and a brief exclusion reason');
  const ignored = await json(join(privateDir, 'ignored.json'), {});
  ignored[canonical] = { reason: reason.slice(0, 300), reviewed_at: new Date().toISOString() };
  await save('ignored.json', ignored);
  console.log(JSON.stringify({ ignored: canonical }));
}
const command = process.argv[2] || 'scan';
try {
  if (command === 'scan') await scan();
  else if (command === 'ack') await acknowledge();
  else if (command === 'ignore') await ignore(process.argv[3], process.argv[4]);
  else throw Error('Usage: node scripts/scan-builds.mjs scan|ack|ignore URL REASON');
} catch (error) {
  console.error(String(error.message).replaceAll(token || '\0', '[redacted]').slice(0, 500));
  process.exitCode = 1;
}
