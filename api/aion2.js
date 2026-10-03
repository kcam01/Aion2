import { getMember } from '../members.js';

const BASE = "https://aion2.plaync.com";
const SEARCH_BASE = "https://api-search.plaync.com";
const LANGUAGE = "en-US";

async function nc(url) {
  const response = await fetch(url, {
    headers: {
      "accept": "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Safari/537.36",
      "referer": "https://aion2.plaync.com/en-us/characters/",
      "origin": "https://aion2.plaync.com"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(8000)
  });
  const body = await response.text();
  if (!response.ok) {
    const e = new Error(`PLAYNC ${response.status}`);
    e.status = response.status;
    e.body = body.slice(0, 500);
    throw e;
  }
  try { return JSON.parse(body); }
  catch { throw new Error("PLAYNC returned non-JSON: " + body.slice(0, 180)); }
}

function cleanName(v="") { return String(v).replace(/<[^>]*>/g,"").trim().toLowerCase(); }

async function resolveCharacterId(member) {
  // Global search uses its own host, region and locale contract.
  const q = new URLSearchParams({
    keyword: member.name, serverId: member.serverId, region: member.region,
    localeInfo: LANGUAGE, page: "1", size: "20"
  });
  try {
    const data = await nc(`${SEARCH_BASE}/aion2global/search/v2/character?${q}`);
    const list = Array.isArray(data.list) ? data.list : [];
    const hit = list.find(x => cleanName(x.name) === cleanName(member.name) &&
      String(x.serverId) === member.serverId && x.region === member.region);
    if (hit?.characterId) return decodeURIComponent(String(hit.characterId));
  } catch (_) {
    // Search downtime must not prevent loading the supplied official profile.
  }
  return member.profileId;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const type = req.query.type ?? "info";
  if (type !== "info" && type !== "equipment") {
    return res.status(400).json({ ok: false, error: "Unsupported character data type" });
  }
  const member = getMember(req.query.member);
  if (!member) {
    return res.status(400).json({ ok: false, error: "Unknown guild member" });
  }
  try {
    const characterId = await resolveCharacterId(member);
    // The Global API requires the region and full language-country locale.
    const q = new URLSearchParams({region: member.region, lang: LANGUAGE, characterId, serverId: member.serverId});
    const data = await nc(`${BASE}/api/character/${type}?${q}`);
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({
      ok:false,
      error:e.message,
      upstreamStatus:e.status || null,
      upstreamPreview:e.body || null,
      character:member.name,
      serverId:member.serverId
    });
  }
}
