import { PLATFORM_NAMES, accountKey, validateCreators, chooseStream, embedUrl } from './creator-directory.js';
import { freshStreams, MAX_STATUS_AGE } from './creator-status-data.js';

const $=id=>document.getElementById(id);
let directory=null, status=null, selected=null, playerSignature='', busy=false;
const node=(tag,className,value)=>{const el=document.createElement(tag);if(className)el.className=className;if(value!==undefined)el.textContent=value;return el;};
const link=(label,url,className)=>{const el=node('a',className,label);el.href=url;return el;};
const external=(label,url,className)=>{const el=link(label,url,className);el.target='_blank';el.rel='noopener noreferrer';return el;};
const characterUrl=slug=>'/member?name='+encodeURIComponent(slug);
function owners(stream) {return directory?.creators.filter(c=>c.accounts.some(a=>accountKey(a)===stream.key))||[];}
function statusFresh(){const age=Date.now()-Date.parse(status?.checkedAt);return Number.isFinite(age)&&age>=-60000&&age<=MAX_STATUS_AGE;}
function renderDirectory() {
  if(!directory)return;
  const query=$('creator-search').value.trim().toLocaleLowerCase();
  const creators=directory.creators.filter(c=>[c.displayName,c.character?.name,...(c.character?.alts||[]).map(a=>a.name),...c.accounts.flatMap(a=>[a.handle,PLATFORM_NAMES[a.platform]])].join(' ').toLocaleLowerCase().includes(query));
  $('creator-count').textContent=`${creators.length} ${creators.length===1?'creator':'creators'}${query?' found':' in the guild directory'}`;
  const cards=creators.map(c=>{
    const card=node('article','creator-card');
    const top=node('div','creator-card-top');top.append(node('span','', 'EXALTED / CREATOR'),node('span','',c.character?'LINKED CHARACTER':'COMMUNITY'));card.append(top);
    const identity=node('div','creator-identity'),avatar=node('div','creator-avatar');avatar.append(node('span','',c.displayName.slice(0,1).toUpperCase()));avatar.setAttribute('aria-hidden','true');
    if(c.character?.portrait){const img=node('img');img.src=c.character.portrait;img.alt='';img.loading='lazy';img.addEventListener('error',()=>img.remove());avatar.append(img);}
    const name=node('div');name.append(node('h3','',c.displayName));
    const sub=node('p');if(c.character){sub.append(link(c.character.name,characterUrl(c.character.slug),'creator-character'),' · Linked character');}else sub.textContent='Shared by this Discord member';
    name.append(sub);identity.append(avatar,name);card.append(identity);
    if(c.character?.alts.length){const alts=node('p','creator-alts','Also in Atreia: ');for(const alt of c.character.alts)alts.append(link(alt.name,characterUrl(alt.slug)));card.append(alts);}
    const socials=node('div','creator-socials');
    for(const a of c.accounts){const count=c.accounts.filter(x=>x.platform===a.platform).length;const anchor=external(PLATFORM_NAMES[a.platform]+(count>1?` / ${a.handle}`:''),a.url,'social-link');anchor.setAttribute('aria-label',`${PLATFORM_NAMES[a.platform]}: ${a.handle} (opens in new tab)`);anchor.append(node('span','','↗'));socials.append(anchor);}card.append(socials);
    const streams=(statusFresh()?status.streams:[]).filter(s=>c.accounts.some(a=>accountKey(a)===s.key));
    const live=streams.filter(s=>s.state==='live');const state=node('p','creator-status');state.dataset.live=String(live.length>0);
    const hasStreams=c.accounts.some(a=>['twitch','youtube','kick'].includes(a.platform));
    state.textContent=live.length?`● Live on ${[...new Set(live.map(s=>PLATFORM_NAMES[s.platform]))].join(' & ')}`:!hasStreams?'Follow their latest stories and updates':!streams.length||streams.some(s=>s.state==='unknown')?'Live status unavailable · Visit their channel':'Currently offline · Explore their channel';card.append(state);return card;
  });
  $('creator-grid').replaceChildren(...cards);$('directory-empty').hidden=creators.length>0;
  if(!directory.creators.length){$('directory-empty').querySelector('h3').textContent='Your story belongs here';$('directory-empty').querySelector('p').textContent='Share your channel in #content-creators to join the directory.';$('clear-search').hidden=true;}
}
function renderPlayer(stream) {
  const container=$('stream-player');
  // Twitch requires a visible player at least 400px wide and 300px tall.
  const small=stream?.platform==='twitch' && container.getBoundingClientRect().width<400;
  const signature=stream?`${stream.key}:${stream.videoId||''}:${small}`:'';
  if(signature===playerSignature)return;
  playerSignature=signature;container.replaceChildren();if(!stream)return;
  const url=embedUrl(stream,location.hostname);
  if(small||!url){const panel=node('div','small-player');panel.append(node('span','live-label','● LIVE NOW'),node('p','',`Watch ${owners(stream)[0]?.displayName||stream.handle} on ${PLATFORM_NAMES[stream.platform]}.`),external('Watch stream ↗',stream.url));container.append(panel);return;}
  const frame=node('iframe');frame.src=url;frame.title=`${PLATFORM_NAMES[stream.platform]} live stream: ${stream.handle}`;frame.allow='autoplay; fullscreen; picture-in-picture; encrypted-media';frame.allowFullscreen=true;container.append(frame);
}
function renderLive() {
  const streams=freshStreams(status);const live=chooseStream(streams,selected);if(live&&!selected)selected=live.key;
  $('live-stage').hidden=!live;$('live-empty').hidden=!!live;document.querySelector('.live-section').dataset.live=String(!!live);
  const unknown=!statusFresh() || status.streams.some(s=>s.state==='unknown');
  const time=statusFresh()?new Date(status.checkedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):null;
  $('live-summary').textContent=live?`${streams.length} live · Checked ${time}${unknown?' · Some unavailable':''}`:unknown?'Live status is temporarily unavailable':`No streams live · Checked ${time}`;
  if(!live){$('live-empty-title').textContent=unknown?'The airwaves are a little quiet':'Between adventures';$('live-empty-copy').textContent=unknown?'We couldn’t confirm who’s live. You can still visit every creator’s channel below.':'No one is live right now. Discover their channels below, and catch the next adventure.';renderPlayer(null);return;}
  $('stream-platform').textContent=PLATFORM_NAMES[live.platform]+' / LIVE';$('stream-title').textContent=live.title||'Live with the guild';$('stream-byline').textContent=owners(live).map(c=>c.displayName).join(' · ')||live.handle;$('stream-open').href=live.url;
  $('live-list').replaceChildren(...streams.map(stream=>{
    const button=node('button','stream-choice');button.type='button';button.setAttribute('aria-pressed',String(stream.key===live.key));
    button.append(node('span','live-label','● LIVE / '+PLATFORM_NAMES[stream.platform].toUpperCase()),node('strong','',owners(stream)[0]?.displayName||stream.handle),node('small','',stream.title||'Watch live'));
    button.append(node('span','selected-label',stream.key===live.key?'NOW SELECTED':'WATCH STREAM ↗'));button.addEventListener('click',()=>{selected=stream.key;renderLive();});return button;
  }));renderPlayer(live);
}
async function refresh() {
  if(busy||!directory)return;busy=true;$('refresh-streams').disabled=true;
  try{const response=await fetch('/api/creator-status',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Unavailable');const value=await response.json();if(!Array.isArray(value.streams))throw Error('Invalid');status=value;}catch{status=null;}
  finally{busy=false;$('refresh-streams').disabled=false;renderLive();renderDirectory();}
}
async function load() {
  $('directory-error').hidden=true;
  try{const response=await fetch('/creators.json',{cache:'no-cache',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Unavailable');directory=validateCreators(await response.json());$('directory-updated').textContent='Directory updated '+new Date(directory.updated_at).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});renderDirectory();await refresh();}
  catch{$('directory-error').hidden=false;$('creator-count').textContent='Directory unavailable';status=null;renderLive();}
}
$('creator-search').addEventListener('input',renderDirectory);$('clear-search').addEventListener('click',()=>{$('creator-search').value='';renderDirectory();$('creator-search').focus();});$('retry-directory').addEventListener('click',load);$('refresh-streams').addEventListener('click',refresh);
new ResizeObserver(()=>{const stream=chooseStream(freshStreams(status),selected);if(stream)renderPlayer(stream);}).observe($('stream-player'));
setInterval(()=>{if(!document.hidden)refresh();},60000);
setInterval(()=>{if(status&&!statusFresh()){renderLive();renderDirectory();}},10000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderLive();refresh();}});
load();
