const BASE = "https://aion2.plaync.com";
const NAME = "Kcamyazimoto";
const SERVER_ID = "2101";

async function nc(path) {
  const response = await fetch(BASE + path, {
    headers: {
      "accept": "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Safari/537.36",
      "referer": "https://aion2.plaync.com/en-us/characters/",
      "origin": "https://aion2.plaync.com"
    },
    redirect: "follow"
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

async function resolveCharacterId() {
  // Global site currently shares the public search contract used by PLAYNC.
  // Try both race values because server-id ranges alone are not a safe Global race assumption.
  const locales = ["en-us", "ko-kr"];
  for (const locale of locales) {
    for (const race of [1,2]) {
      const q = new URLSearchParams({keyword:NAME, race:String(race), serverId:SERVER_ID, page:"1", size:"20"});
      try {
        const data = await nc(`/${locale}/api/search/aion2/search/v2/character?${q}`);
        const list = Array.isArray(data.list) ? data.list : [];
        const hit = list.find(x => cleanName(x.name) === cleanName(NAME) && String(x.serverId ?? SERVER_ID) === SERVER_ID);
        if (hit?.characterId) return decodeURIComponent(String(hit.characterId));
      } catch (_) {}
    }
  }
  // Known token from the user's official profile URL as a last fallback.
  return "F0Ubce33Dq_LpNdYg_lVaqPZpJG8FPD3oqJ55tgv1cY=";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  try {
    const type = req.query.type === "equipment" ? "equipment" : "info";
    const characterId = await resolveCharacterId();
    const q = new URLSearchParams({lang:"en", characterId, serverId:SERVER_ID});
    const data = await nc(`/api/character/${type}?${q}`);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({
      ok:false,
      error:e.message,
      upstreamStatus:e.status || null,
      upstreamPreview:e.body || null,
      character:NAME,
      serverId:SERVER_ID
    });
  }
}
