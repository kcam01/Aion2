export const CHANNEL_URL = "https://discord.com/channels/1556392756836966481/1556392761337315329";
const HASH = /^[a-f0-9]{64}$/;
const SOURCE = /^https:\/\/discord\.com\/channels\/1556392756836966481\/1556392761337315329\/[0-9]{1,25}$/;
function requireValue(condition, message) { if (!condition) throw new TypeError("Invalid gallery: " + message); }
function validText(value, limit, allowEmpty = false) { return typeof value === "string" && value.length <= limit && (allowEmpty || value.trim().length > 0); }
function validDate(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)); }
export function validateManifest(input) {
  requireValue(input && typeof input === "object" && !Array.isArray(input), "manifest");
  requireValue(input.schema_version === 1, "schema version");
  requireValue(validDate(input.updated_at), "update date");
  requireValue(input.source?.name === "general" && input.source.url === CHANNEL_URL, "source");
  requireValue(Array.isArray(input.images) && input.images.length <= 20000, "images");
  const seen = new Set();
  const images = input.images.map(item => {
    requireValue(item && typeof item === "object" && !Array.isArray(item), "image");
    requireValue(typeof item.id === "string" && HASH.test(item.id) && !seen.has(item.id), "image ID");
    seen.add(item.id);
    requireValue(validText(item.title, 300), "title");
    requireValue(validText(item.description, 5000, true), "description");
    requireValue(validText(item.author, 300), "author");
    requireValue(validDate(item.posted_at), "posted date");
    requireValue(item.image === "/assets/gallery/" + item.id + ".webp", "image path");
    requireValue(item.thumbnail === "/assets/gallery/" + item.id + "-thumb.webp", "thumbnail path");
    requireValue(Number.isInteger(item.width) && item.width > 0 && item.width <= 50000, "width");
    requireValue(Number.isInteger(item.height) && item.height > 0 && item.height <= 50000, "height");
    requireValue(typeof item.source_url === "string" && SOURCE.test(item.source_url), "Discord link");
    return {id:item.id,title:item.title,description:item.description,author:item.author,posted_at:item.posted_at,image:item.image,thumbnail:item.thumbnail,width:item.width,height:item.height,source_url:item.source_url};
  });
  return {schema_version:1,updated_at:input.updated_at,source:{name:"general",url:CHANNEL_URL},images};
}
export function filterImages(images, query = "", sort = "newest") {
  const words = String(query).trim().toLowerCase().split(/\s+/).filter(Boolean);
  const direction = sort === "oldest" ? 1 : -1;
  return images.filter(item => {
    const text = (item.title + " " + item.description + " " + item.author).toLowerCase();
    return words.every(word => text.includes(word));
  }).sort((a,b) => direction * (Date.parse(a.posted_at) - Date.parse(b.posted_at)) || a.id.localeCompare(b.id));
}
