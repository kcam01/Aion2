const PRIMARY = [ ['STR', 'Might'], ['DEX', 'Dexterity'], ['INT', 'Intelligence'], ['CON', 'Constitution'], ['AGI', 'Precision'], ['WIS', 'Willpower'] ];
const SLOTS = [ ['MainHand', 'Main hand'], ['SubHand', 'Off hand'], ['Helmet', 'Helmet'], ['Shoulder', 'Shoulders'], ['Torso', 'Torso'], ['Pants', 'Pants'], ['Gloves', 'Gloves'], ['Boots', 'Boots'], ['Cape', 'Cape'], ['Belt', 'Belt'], ['Necklace', 'Necklace'], ['Amulet', 'Amulet'], ['Earring1', 'Earring'], ['Earring2', 'Earring'], ['Ring1', 'Ring'], ['Ring2', 'Ring'], ['Bracelet1', 'Bracelet'], ['Bracelet2', 'Bracelet'], ['Wings', 'Wings'], ['Pet', 'Pet'] ];
const list = value => Array.isArray(value) ? value.filter(x => x && typeof x === 'object') : [];
const number = value => value !== null && value !== '' && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
const string = value => typeof value === 'string' ? value : '';
const data = value => value?.data || value || {};
export const formatNumber = value => value == null ? '—' : Number(value).toLocaleString('en-US');

export function safeImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['assets.playnccdn.com', 'profileimg.plaync.com'].includes(url.hostname) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function item(raw, slot = raw.slotPosName) {
  const index = SLOTS.findIndex(([key]) => key === slot);
  const grade = string(raw.grade);
  return {
    name: string(raw.name) || 'Unnamed equipment', slot: SLOTS[index]?.[1] || string(slot) || 'Equipment', order: index < 0 ? 99 : index,
    grade, rarity: ['Common', 'Rare', 'Legend', 'Unique', 'Epic', 'Mythic', 'Special'].includes(grade) ? grade.toLowerCase() : 'common',
    icon: safeImage(raw.icon || raw.iconUrl), enchant: number(raw.enchantLevel), exceed: number(raw.exceedLevel), level: number(raw.level),
  };
}

export function buildSheet(rawInfo, rawEquipment, member = {}) {
  const info = data(rawInfo), equipment = data(rawEquipment), profile = info.profile || {};
  const stats = list(info.stat?.statList);
  const primary = PRIMARY.map(([type, name]) => {
    const stat = stats.find(x => x.type === type);
    return { type, name, value: number(stat?.value), effects: (stat?.statSecondList || []).filter(x => typeof x === 'string') };
  });
  const divine = stats.filter(x => !PRIMARY.some(([type]) => x.type === type) && x.type !== 'ItemLevel').map(x => {
    const match = string(x.name).match(/^(.*?)\s*\[(.*?)\]$/);
    return { type: string(x.type), name: match?.[1] || string(x.name), deity: match?.[2] || '', value: number(x.value), effects: (x.statSecondList || []).filter(x => typeof x === 'string') };
  });
  const gear = list(equipment.equipment?.equipmentList).map(x => item(x));
  const companions = equipment.petwing || equipment.petWing || {};
  if (companions.wing?.name) gear.push(item(companions.wing, 'Wings'));
  if (companions.pet?.name) gear.push(item(companions.pet, 'Pet'));
  gear.sort((a, b) => a.order - b.order);
  const skills = list(equipment.skill?.skillList).map(x => ({
    name: string(x.name) || 'Unnamed skill', category: x.category === 'Dp' ? 'DP' : string(x.category) || 'Other',
    icon: safeImage(x.icon || x.iconUrl), level: number(x.skillLevel), requiredLevel: number(x.needLevel), acquired: Number(x.acquired) === 1, equipped: Number(x.equip) === 1,
  }));
  const boards = list(info.daevanion?.boardList).map(x => {
    const opened = number(x.openNodeCount), total = number(x.totalNodeCount);
    const percent = number(x.openPercent) ?? (opened != null && total > 0 ? Math.round(opened / total * 100) : null);
    return { name: string(x.name), opened, total, percent: percent == null ? null : Math.max(0, Math.min(100, percent)), unlocked: Number(x.open) === 1 };
  });
  return {
    name: string(profile.characterName) || member.name || 'Character', className: string(profile.className) || member.className || 'Class unavailable',
    server: string(profile.serverName) || member.serverName || 'Server unavailable', faction: string(profile.raceName) || 'Faction unavailable',
    title: string(profile.titleName), titleGrade: string(profile.titleGrade), level: number(profile.characterLevel), combatPower: number(profile.combatPower),
    itemLevel: number(stats.find(x => x.type === 'ItemLevel')?.value), portrait: safeImage(profile.profileImage || profile.profileImageUrl || member.portrait),
    primary, divine, equipment: gear, skills, skillPreview: skills.filter(x => x.acquired).sort((a, b) => Number(b.equipped) - Number(a.equipped) || (b.level ?? 0) - (a.level ?? 0)).slice(0, 6),
    boards, titles: list(info.title?.titleList).sort((a,b) => ({ Attack: 0, Defense: 1, Etc: 2 }[a.equipCategory] ?? 3) - ({ Attack: 0, Defense: 1, Etc: 2 }[b.equipCategory] ?? 3)),
    titlesOwned: number(info.title?.ownedCount), titlesTotal: number(info.title?.totalCount),
  };
}

export function parseHistory(raw) {
  try {
    return list(JSON.parse(raw)).filter(x => typeof x.checkedAt === 'string' && Number.isFinite(Date.parse(x.checkedAt)) && ['level', 'combatPower', 'itemLevel'].every(key => typeof x[key] === 'number' && Number.isFinite(x[key]) && x[key] >= 0)).slice(0, 20);
  } catch { return []; }
}

export function appendHistory(history, sheet, checkedAt = new Date().toISOString()) {
  const keys = ['level', 'combatPower', 'itemLevel'];
  if (keys.some(key => typeof sheet[key] !== 'number' || !Number.isFinite(sheet[key])) || !Number.isFinite(Date.parse(checkedAt))) return history;
  if (history[0] && keys.every(key => sheet[key] === history[0][key])) return history;
  return [{ checkedAt, level: sheet.level, combatPower: sheet.combatPower, itemLevel: sheet.itemLevel }, ...history].slice(0, 20);
}
