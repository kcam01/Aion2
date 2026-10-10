"""Pure contracts for the Exalted Discord character gallery."""
import json
import math
import re
from urllib.parse import urlsplit

GUILD_ID = "1556392756836966481"
CHANNEL_ID = "1556392761337315329"
SOURCE_URL = f"https://discord.com/channels/{GUILD_ID}/{CHANNEL_ID}"
MAX_BYTES = 20 * 1024 * 1024
MODEL = "google/gemma-4-26b-a4b-it:free"

def validate_model(model):
    if not isinstance(model, str) or not (model == "openrouter/free" or re.fullmatch(r"[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.:-]+:free", model)):
        raise ValueError("Gallery analysis requires an OpenRouter free model")

def clean_text(value, limit):
    if not isinstance(value, str):
        return ""
    return " ".join(re.sub(r"[\x00-\x1f\x7f]", " ", value).split())[:limit]

def parse_analysis(content):
    if not isinstance(content, str):
        raise ValueError("Missing analysis")
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^\`\`\`(?:json)?\s*|\s*\`\`\`$", "", text).strip()
    try:
        data = json.loads(text)
    except (ValueError, TypeError) as exc:
        raise ValueError("Invalid analysis JSON") from exc
    if isinstance(data, list) and len(data) == 1:
        data = data[0]
    if not isinstance(data, dict) or not all(k in data for k in ("is_aion2_character", "safe", "confidence", "title", "description")):
        raise ValueError("Incomplete analysis")
    confidence = data["confidence"]
    numeric = type(confidence) in (int, float) and math.isfinite(confidence) and 0 <= confidence <= 1
    if not numeric or type(data["safe"]) is not bool or type(data["is_aion2_character"]) is not bool or not all(isinstance(data[k], str) and data[k].strip() for k in ("title", "description")):
        raise ValueError("Malformed analysis fields")
    accepted = data["is_aion2_character"] is True and data["safe"] is True and numeric and confidence >= .85
    return {"accepted": bool(accepted), "confidence": confidence if numeric else 0,
            "title": clean_text(data["title"], 90) or "A character of Atreia",
            "description": clean_text(data["description"], 350) or "An AION 2 character shared by the guild."}

def allowed_image_url(value):
    try:
        u = urlsplit(value)
        return (u.scheme == "https" and u.hostname in ("cdn.discordapp.com", "media.discordapp.net")
                and not u.username and not u.password and not u.port
                and u.path.startswith(("/attachments/", "/external/")))
    except (ValueError, TypeError):
        return False

def message_candidates(message):
    if message.get("author", {}).get("bot"):
        return []
    author = message.get("author", {})
    name = clean_text((message.get("member") or {}).get("nick") or author.get("global_name") or author.get("username"), 80) or "Guildmate"
    candidates = []
    files = list(message.get("attachments", []))
    # Only Discord-hosted embed images; never follow arbitrary user supplied URLs.
    for index, embed in enumerate(message.get("embeds", [])):
        img = embed.get("image") or {}
        url = img.get("proxy_url") or img.get("url")
        if url and allowed_image_url(url):
            files.append({"id": f"embed-{index}", "url": url, "content_type": "image/unknown",
                          "size": 0, "width": img.get("width"), "height": img.get("height")})
    for a in files:
        url = a.get("url", "")
        is_image = str(a.get("content_type", "")).startswith("image/") or bool(re.search(r"\.(png|jpe?g|webp|gif)$", a.get("filename", ""), re.I))
        if not is_image or not allowed_image_url(url) or a.get("size", 0) > MAX_BYTES:
            continue
        if a.get("content_type") in ("image/svg+xml",):
            continue
        candidates.append({"key": message["id"] + ":" + str(a["id"]), "message_id": message["id"],
                           "timestamp": message["timestamp"], "author": name, "url": url,
                           "attachment_id": str(a["id"]), "filename": a.get("filename", ""),
                           "size": a.get("size", 0)})
    return candidates

def build_images(candidates, cache):
    # Prefer the most recent surviving copy; Discord deletion removes its source.
    chosen = {}
    for candidate in sorted(candidates, key=lambda c: (c["timestamp"], int(c["message_id"]))):
        digest = candidate.get("hash", "")
        analysis = cache.get(digest, {})
        if not re.fullmatch(r"[a-f0-9]{64}", digest) or analysis.get("accepted") is not True:
            continue
        chosen[digest] = {
            "id": digest, "title": analysis["title"], "description": analysis["description"],
            "author": candidate["author"], "posted_at": candidate["timestamp"],
            "image": f"/assets/gallery/{digest}.webp", "thumbnail": f"/assets/gallery/{digest}-thumb.webp",
            "width": analysis["width"], "height": analysis["height"],
            "source_url": SOURCE_URL + "/" + candidate["message_id"],
        }
    return sorted(chosen.values(), key=lambda c: (c["posted_at"], c["id"]), reverse=True)

def make_manifest(images, previous, now):
    if previous and previous.get("schema_version") == 1 and previous.get("images") == images:
        return previous
    return {"schema_version": 1, "updated_at": now, "source": {"name": "general", "url": SOURCE_URL}, "images": images}


def assert_read_access(bot_id, member, roles, channel):
    if not isinstance(member.get("roles"), list) or not isinstance(roles, list) or not isinstance(channel.get("permission_overwrites"), list):
        raise ValueError("Discord permissions cannot be verified")
    member_roles = set(member["roles"])
    permissions = 0
    for role in roles:
        if role["id"] == GUILD_ID or role["id"] in member_roles:
            permissions |= int(role["permissions"])
    if permissions & 8:
        return
    overwrites = channel["permission_overwrites"]
    everyone = next((o for o in overwrites if o["type"] == 0 and o["id"] == GUILD_ID), None)
    if everyone:
        permissions = (permissions & ~int(everyone["deny"])) | int(everyone["allow"])
    denied, allowed = 0, 0
    for overwrite in overwrites:
        if overwrite["type"] == 0 and overwrite["id"] in member_roles:
            denied |= int(overwrite["deny"])
            allowed |= int(overwrite["allow"])
    permissions = (permissions & ~denied) | allowed
    personal = next((o for o in overwrites if o["type"] == 1 and o["id"] == bot_id), None)
    if personal:
        permissions = (permissions & ~int(personal["deny"])) | int(personal["allow"])
    if permissions & 66560 != 66560:
        raise ValueError("Discord channel/history access unavailable")
