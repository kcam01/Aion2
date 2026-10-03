import * as THREE from 'three';
const r=new THREE.WebGLRenderer({canvas:document.querySelector('#bg'),alpha:true,antialias:true});r.setPixelRatio(Math.min(devicePixelRatio,1.7));const s=new THREE.Scene(),c=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,100);c.position.z=10;
const n=900,p=new Float32Array(n*3);for(let i=0;i<p.length;i++)p[i]=(Math.random()-.5)*24;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));const pts=new THREE.Points(g,new THREE.PointsMaterial({size:.025,color:0x72e9f0,transparent:true,opacity:.55}));s.add(pts);
function resize(){r.setSize(innerWidth,innerHeight);c.aspect=innerWidth/innerHeight;c.updateProjectionMatrix()}addEventListener('resize',resize);resize();let mx=0,my=0;addEventListener('pointermove',e=>{mx=e.clientX/innerWidth-.5;my=e.clientY/innerHeight-.5});function loop(t){pts.rotation.y=t*.000025+mx*.08;pts.rotation.x=my*.04;r.render(s,c);requestAnimationFrame(loop)}requestAnimationFrame(loop);
const $=id=>document.getElementById(id), fmt=x=>x==null?'—':(isNaN(Number(x))?x:Number(x).toLocaleString());
const pick=(o,...ks)=>{for(const k of ks){if(o&&o[k]!=null)return o[k]}};
async function get(type){const r=await fetch('/api/aion2?type='+type,{cache:'no-store'});const t=await r.text();let j;try{j=JSON.parse(t)}catch{throw Error('Proxy returned '+r.status+': '+t.slice(0,100))}if(!r.ok)throw Error(j.error||('HTTP '+r.status));return j}
async function load(){
 try{
  const [info,eq]=await Promise.all([get('info'),get('equipment')]);
  const x=info.profile||info.data?.profile||info.data||info;
  $('cp').textContent=fmt(pick(x,'combatPower','combat_power'));
  $('level').textContent=fmt(pick(x,'level','characterLevel'));
  const cls=pick(x,'className','jobName','class')||'—';
  $('class').textContent=cls==='—'?'AION 2 CHARACTER':cls.toUpperCase();
  $('class2').textContent=cls;
  $('race').textContent=pick(x,'raceName','race')||'—';
  $('guild').textContent=pick(x,'guildName','legionName')||'—';
  const img=pick(x,'profileImageUrl','profileImage','profileImg','imageUrl');
  if(img){$('portrait').src=img;$('portrait').hidden=false;$('fallback').hidden=true}
  renderStats(info);renderEquipment(eq);renderExtras(eq);
  $('status').textContent='Live PLAYNC data · refreshed automatically';
 }catch(e){$('status').textContent='PLAYNC connection error: '+e.message;console.error(e)}
}
function renderStats(info){
 const raw=info.stat||info.stats||info.data?.stat||info.data?.stats||{};
 let list=Array.isArray(raw)?raw:(raw.statList||raw.list||raw.totalStat||[]);
 if(!Array.isArray(list)) list=Object.entries(list).map(([name,value])=>({name,value}));
 const m={}; for(const z of list){m[String(z.name||z.statName||z.key||'').toLowerCase()]=z.value??z.statValue??z.totalValue}
 const aliases=[['attack','atk'],['defense','def'],['hp','maxhp'],['critical','crit'],['accuracy','hit'],['evasion','dodge']];
 [...document.querySelectorAll('#stats span b')].forEach((el,i)=>{for(const k of aliases[i])if(m[k]!=null){el.textContent=fmt(m[k]);break}})
}
function renderEquipment(raw){
 const d=raw.data||raw, bucket=d.equipment||d.equipmentList||d.items||[];
 const items=Array.isArray(bucket)?bucket:(bucket.itemList||bucket.list||[]);
 if(!items.length)return;
 $('gear').innerHTML=items.slice(0,16).map(x=>`<div class="card">${(x.iconUrl||x.icon)?`<img src="${x.iconUrl||x.icon}" loading="lazy">`:''}<b>${x.name||x.itemName||'Equipment'}</b><i>${x.enchantLevel!=null?'+'+x.enchantLevel:''}</i></div>`).join('');
}
function renderExtras(raw){
 const d=raw.data||raw, sk=d.skill||d.skills||{}, list=Array.isArray(sk)?sk:(sk.skillList||sk.list||[]);
 if(list.length)$('skills').innerHTML=list.slice(0,12).map(x=>`<div class="card">${(x.iconUrl||x.icon)?`<img src="${x.iconUrl||x.icon}" loading="lazy">`:''}<b>${x.name||x.skillName||'Skill'}</b><i>${x.level!=null?'Lv. '+x.level:''}</i></div>`).join('');
 const pw=d.petWing||d.petwing||{}, wing=pw.wing||d.wing, pet=pw.pet||d.pet;
 if(wing)$('wings').textContent=wing.name||wing.itemName||wing.wingName||'Equipped';
 if(pet)$('pet').textContent=pet.name||pet.petName||'Equipped';
}
load();
