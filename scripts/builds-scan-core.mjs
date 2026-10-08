import { canonicalGuideUrl } from '../guide-library.js';

export async function readChannelHistory(readPage) {
  const messages = [], seen = new Set();
  let before;
  for (let page = 0; page < 500; page++) {
    const batch = await readPage(before);
    if (!Array.isArray(batch)) throw Error('Incomplete Discord scan');
    for (const message of batch) {
      if (!/^\d+$/.test(message.id) || seen.has(message.id)) throw Error('Repeated or invalid Discord page');
      seen.add(message.id); messages.push(message);
    }
    if (batch.length < 100) return messages;
    before = batch.at(-1).id;
  }
  throw Error('Discord scan limit reached; checkpoint was not advanced');
}

export function collectGuideLinks(messages) {
  const links = new Map();
  for (const message of messages) {
    const embedded = (message.embeds || []).filter(embed => typeof embed.url === 'string');
    const rawUrls = [...(message.content || '').matchAll(/https:\/\/[^\s<>"`]+/g)].map(match => match[0].replace(/[.,;!?]+$/, ''));
    // Discord Markdown links have a wrapping closing parenthesis; balanced URL parentheses remain.
    for (let raw of [...rawUrls, ...embedded.map(embed => embed.url)]) {
      while (raw.endsWith(')') && (raw.match(/\)/g)?.length || 0) > (raw.match(/\(/g)?.length || 0)) raw = raw.slice(0, -1);
      const url = canonicalGuideUrl(raw);
      if (!url) continue;
      const title = embedded.find(embed => canonicalGuideUrl(embed.url) === url)?.title;
      const prior = links.get(url);
      if (!prior) links.set(url, { url, shared_at: message.timestamp, message_ids: [message.id], title_hint: typeof title === 'string' ? title.slice(0, 240) : null });
      else {
        if (!prior.message_ids.includes(message.id)) prior.message_ids.push(message.id);
        if (Date.parse(message.timestamp) < Date.parse(prior.shared_at)) prior.shared_at = message.timestamp;
        if (!prior.title_hint && typeof title === 'string') prior.title_hint = title.slice(0, 240);
      }
    }
  }
  return [...links.values()].sort((a, b) => a.url.localeCompare(b.url));
}
