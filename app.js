import { getMember, members, officialProfile } from './members.js';

// The visual background is optional; profile data loads even without WebGL/CDN.
async function background(){
const THREE = await import('three');
const r=new THREE.WebGLRenderer({canvas:document.querySelector('#bg'),alpha:true,antialias:true});r.setPixelRatio(Math.min(devicePixelRatio,1.7));const s=new THREE.Scene(),c=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,100);c.position.z=10;
const n=900,p=new Float32Array(n*3);for(let i=0;i<p.length;i++)p[i]=(Math.random()-.5)*24;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));const pts=new THREE.Points(g,new THREE.PointsMaterial({size:.025,color:0x72e9f0,transparent:true,opacity:.55}));s.add(pts);
function resize(){r.setSize(innerWidth,innerHeight);c.aspect=innerWidth/innerHeight;c.updateProjectionMatrix()}addEventListener('resize',resize);resize();let mx=0,my=0;addEventListener('pointermove',e=>{mx=e.clientX/innerWidth-.5;my=e.clientY/innerHeight-.5});function loop(t){pts.rotation.y=t*.000025+mx*.08;pts.rotation.x=my*.04;r.render(s,c);requestAnimationFrame(loop)}
if(matchMedia('(prefers-reduced-motion: reduce)').matches)r.render(s,c);else requestAnimationFrame(loop);
}
background().catch(()=>{});
const $=id=>document.getElementById(id), fmt=x=>x==null?'—':(isNaN(Number(x))?x:Number(x).toLocaleString());
const member = getMember(new URLSearchParams(location.search).get('name') ?? undefined);
const pick=(o,...ks)=>{for(const k of ks){if(o&&o[k]!=null)return o[k]}};
async function get(type){const r=await fetch('/api/aion2?'+new URLSearchParams({type,member:member.slug}),{cache:'no-store',signal:AbortSignal.timeout(20000)});const t=await r.text();let j;try{j=JSON.parse(t)}catch{throw Error('Proxy returned '+r.status+': '+t.slice(0,100))}if(!r.ok)throw Error(j.error||('HTTP '+r.status));return j}
async function load(){
 try{
  const [info,eq]=await Promise.all([get('info'),get('equipment')]);
  const x=info.profile||info.data?.profile||info.data||info;
  $('character-name').textContent=x.characterName||member.name;
  $('character-title').textContent=x.titleName||'No displayed title';
  $('server').textContent=x.serverName||'—';
  $('server-label').textContent=x.serverName||'—';
  $('cp').textContent=fmt(pick(x,'combatPower','combat_power'));
  $('level').textContent=fmt(pick(x,'level','characterLevel'));
  const cls=pick(x,'className','jobName','class')||'—';
  $('class').textContent=cls==='—'?'AION 2 CHARACTER':cls.toUpperCase();
  $('class2').textContent=cls;
  $('race').textContent=pick(x,'raceName','race')||'—';
  $('guild').textContent=pick(x,'guildName','legionName','regionName')||'None';
  const img=pick(x,'profileImageUrl','profileImage','profileImg','imageUrl');
  if(img){$('portrait').onerror=()=>{$('portrait').hidden=true;$('fallback').hidden=false};$('portrait').src=img;$('portrait').alt=member.name+' character portrait';$('portrait').hidden=false;$('fallback').hidden=true}
  renderStats(info);renderTitles(info);renderEquipment(eq);renderExtras(eq);
  $('status').textContent='Live PLAYNC data';
 }catch(e){$('status').textContent='PLAYNC connection error: '+e.message;$('title-summary').textContent='Titles unavailable';$('title-list').textContent='Title data could not be loaded. Try refreshing the page.';console.error(e)}
}
function renderTitles(info){
 const data=info.data||info,profile=data.profile||{},titles=data.title;
 const text=(tag,className,value)=>{const el=document.createElement(tag);el.className=className;el.textContent=value;return el};
 const count=(owned,total)=>owned==null?'Collection count unavailable':total==null?`${fmt(owned)} collected`:`${fmt(owned)} / ${fmt(total)} collected`;
 $('title-summary').textContent=count(titles?.ownedCount,titles?.totalCount);
 $('displayed-title').textContent=profile.titleName||'No displayed title';
 $('displayed-title-grade').textContent=profile.titleName?(profile.titleGrade||''):'';
 const list=Array.isArray(titles?.titleList)?[...titles.titleList]:[];
 const order={Attack:0,Defense:1,Etc:2},categories={Attack:'Attack',Defense:'Defense',Etc:'Other'};
 list.sort((a,b)=>(order[a.equipCategory]??99)-(order[b.equipCategory]??99));
 if(!list.length){$('title-list').replaceChildren(text('li','title-empty','No equipped title details were returned by PLAYNC.'));return}
 $('title-list').replaceChildren(...list.map(title=>{
  const card=text('li','title-card',''),top=text('div','title-card-top','');
  top.append(text('span','title-category',categories[title.equipCategory]||title.equipCategory||'Title'),text('span','title-grade',title.grade||''));
  card.append(top,text('h3','title-name',title.name||'No title equipped'),text('p','title-slot-status',title.name?'Equipped title':'Empty slot'));
  const effects=text('dl','title-effects','');
  for(const [label,stats] of [['Equipped effect',title.equipStatList],['Title effect',title.statList]]){
   if(!Array.isArray(stats))continue;
   const descriptions=stats.map(stat=>stat.desc).filter(Boolean);
   if(!descriptions.length)continue;
   const effect=text('div','','');effect.append(text('dt','',label));
   for(const description of descriptions)effect.append(text('dd','',description));
   effects.append(effect);
  }
  card.append(effects,text('p','title-category-count',count(title.ownedCount,title.totalCount)));
  return card;
 }));
}
function renderStats(info){
 const raw=info.stat||info.stats||info.data?.stat||info.data?.stats||{};
 let list=Array.isArray(raw)?raw:(raw.statList||raw.list||raw.totalStat||[]);
 if(!Array.isArray(list)) list=Object.entries(list).map(([name,value])=>({name,value}));
 const primary=list.filter(x=>['STR','DEX','INT','CON','AGI','WIS'].includes(x.type));
 const shown=primary.length?primary:list.slice(0,6);
 $('stats').replaceChildren(...shown.map(x=>{
  const row=document.createElement('span'),value=document.createElement('b');
  value.textContent=fmt(x.value??x.statValue??x.totalValue);
  row.append(document.createTextNode((x.name||x.statName||x.type)+' '),value);
  return row;
 }));
}
function renderEquipment(raw){
 const d=raw.data||raw, bucket=d.equipment||d.equipmentList||d.items||[];
 const items=Array.isArray(bucket)?bucket:(bucket.equipmentList||bucket.itemList||bucket.list||[]);
 if(!items.length)return;
 $('gear').replaceChildren(...items.map(x=>{
  const card=document.createElement('div'),name=document.createElement('b'),level=document.createElement('i');
  card.className='card';
  name.textContent=x.name||x.itemName||'Equipment';
  level.textContent=x.enchantLevel!=null?'+'+x.enchantLevel:'';
  const icon=x.iconUrl||x.icon;
  if(icon){
   const link=document.createElement('a'),img=document.createElement('img');
   link.className='gear-art';link.href=icon;link.target='_blank';link.rel='noopener noreferrer';
   link.title='Open '+name.textContent+' image';
   img.src=icon;img.alt=name.textContent;img.loading='lazy';img.width=80;img.height=80;
   img.addEventListener('error',()=>{link.hidden=true},{once:true});
   link.append(img);card.append(link);
  }
  card.append(name,level);return card;
 }));
}
function renderExtras(raw){
 const d=raw.data||raw, sk=d.skill||d.skills||{}, list=Array.isArray(sk)?sk:(sk.skillList||sk.list||[]);
 if(list.length)$('skills').innerHTML=list.slice(0,12).map(x=>`<div class="card">${(x.iconUrl||x.icon)?`<img src="${x.iconUrl||x.icon}" loading="lazy">`:''}<b>${x.name||x.skillName||'Skill'}</b><i>${(x.skillLevel??x.level)!=null?'Lv. '+(x.skillLevel??x.level):''}</i></div>`).join('');
 const pw=d.petWing||d.petwing||{}, wing=pw.wing||d.wing, pet=pw.pet||d.pet;
 if(wing)$('wings').textContent=wing.name||wing.itemName||wing.wingName||'Equipped';
 if(pet)$('pet').textContent=pet.name||pet.petName||'Equipped';
 for(const [id,item] of [['wings',wing],['pet',pet]]){
  const link=$(id+'-art'),img=link.querySelector('img'),icon=item?.iconUrl||item?.icon;
  link.hidden=!icon;
  if(icon){
   link.href=icon;link.title='Open '+$(id).textContent+' image';
   img.alt=$(id).textContent;img.onerror=()=>{link.hidden=true};img.src=icon;
  }else{img.removeAttribute('src');link.removeAttribute('href')}
 }
}
if(member){
 document.title=member.name+' · Exalted';
 $('character-name').textContent=member.name;
 $('fallback').querySelector('i').textContent=member.name[0];
 $('server-label').textContent=member.serverName;
 $('official-profile').href=officialProfile(member);
 $('official-profile').hidden=false;
 const other=members.find(x=>x.slug!==member.slug);
 $('other-member').href='/member?name='+other.slug;
 $('other-member').textContent=other.name+' ↗';
 load();
}else{
 document.title='Member not found · Exalted';
 $('character-name').textContent='Member not found';
 $('status').textContent='Choose Sarcodine or KcamYazimoto from the Exalted home page.';
 $('title-summary').textContent='Member not found';
 $('title-list').textContent='Choose a member to see their titles.';
}
