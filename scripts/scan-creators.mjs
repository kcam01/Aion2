// Private Discord author IDs and source receipts never enter the public directory.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discordRead } from './discord-read.mjs';
import { readChannelHistory } from './builds-scan-core.mjs';
import { creatorPosts, assertReadAccess } from './creators-scan-core.mjs';
import { groupCreators, validateCreators } from '../creator-directory.js';

const root=fileURLToPath(new URL('../',import.meta.url)), privateDir=join(root,'output','creators-monitor');
const guildId='1556392756836966481', channelId='1557808999049592952';
const origin='https://exalted-aion2.vercel.app';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function read(path,fallback) { try { return JSON.parse(await readFile(path,'utf8')); } catch(e) { if(e.code==='ENOENT' && fallback!==undefined) return fallback; throw e; } }
async function save(name,value) { await mkdir(privateDir,{recursive:true}); const path=join(privateDir,name); await writeFile(path+'.tmp',JSON.stringify(value,null,2)+'\n'); await rename(path+'.tmp',path); }
async function publicJson(url) { const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000)}); if(!r.ok) throw Error(`Public read failed: HTTP ${r.status}`); return r.json(); }

function approvedLinks(ids) {
  if (!ids.length) return {};
  if (ids.some(id=>!/^\d+$/.test(id))) throw Error('Invalid author identity');
  const script=`import json,sqlite3\nfrom pathlib import Path\nids=${JSON.stringify(ids)}\ndb=sqlite3.connect(Path('/home/kcam/bots/exalted/data/exalted.sqlite3').as_uri()+'?mode=ro',uri=True,timeout=10)\ndb.execute('PRAGMA query_only = ON')\nrows=db.execute("SELECT user_id,character FROM links WHERE status='approved' AND user_id IN ("+','.join('?' for _ in ids)+")",ids).fetchall()\nprint(json.dumps({str(uid):json.loads(char) for uid,char in rows}))\ndb.close()\n`;
  try { return JSON.parse(execFileSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10','oldcg','python3 -'],{input:script,encoding:'utf8',timeout:30000,windowsHide:true,stdio:['pipe','pipe','pipe']})); }
  catch { throw Error('Approved character lookup failed; directory unchanged'); }
}
async function scan() {
  const channel=await discordRead(`/channels/${channelId}`);
  if(channel.guild_id!==guildId || channel.name!=='content-creators' || channel.type!==0) throw Error('Unexpected creator channel');
  const application=await discordRead('/oauth2/applications/@me');
  const botId=application.bot?.id || (await discordRead('/users/@me')).id;
  const member=await discordRead(`/guilds/${guildId}/members/${botId}`);
  const roles=await discordRead(`/guilds/${guildId}/roles`);
  assertReadAccess({guildId,botId,member,roles,channel,application});
  const messages=await readChannelHistory(before=>discordRead(`/channels/${channelId}/messages?limit=100${before?'&before='+before:''}`));
  messages.sort((a,b)=>BigInt(a.id)>BigInt(b.id)?-1:1);
  const result=await creatorPosts(messages,async url=>{
    try { return (await publicJson(`https://www.youtube.com/oembed?${new URLSearchParams({url,format:'json'})}`)).author_url; } catch { return null; }
  });
  const ids=await read(join(privateDir,'identities.json'),{});
  const authors=[...new Set(result.posts.map(p=>p.authorId))];
  for(const id of authors) if(!ids[id]) ids[id]='creator-'+randomUUID();
  const approved=approvedLinks(authors);
  // Use current guild nicknames, with the message's public name as a fallback for departed members.
  for(const id of authors) {
    let member; try { member=await discordRead(`/guilds/${guildId}/members/${id}`); } catch(e) { if(!e.message.includes('404')) throw e; }
    if(member) for(const post of result.posts.filter(p=>p.authorId===id)) post.displayName=String(member.nick||member.user.global_name||member.user.username).replace(/[\x00-\x1f]/g,'').slice(0,120);
  }
  const roster=await publicJson(origin+'/members.json');
  const creators=groupCreators(result.posts,approved,roster,ids);
  const candidate=validateCreators({schema_version:1,updated_at:new Date().toISOString(),creators});
  const existing=validateCreators(await read(join(root,'creators.json')));
  const ignored=await read(join(privateDir,'ignored.json'),{});
  const unresolved=result.unresolved.filter(item=>!ignored[item.url]);
  const pending={version:1,channelId,scanned_at:new Date().toISOString(),message_count:messages.length,source_hash:hash(messages.map(m=>({id:m.id,author:m.author?.id,content:m.content,embeds:m.embeds}))),candidate,unresolved,changed:hash(existing.creators)!==hash(creators)};
  await save('identities.json',ids); await save('pending.json',pending);
  console.log(JSON.stringify({scanned_at:pending.scanned_at,messages:messages.length,creators:creators.length,accounts:creators.reduce((n,c)=>n+c.accounts.length,0),changed:pending.changed,unresolved},null,2));
}
async function apply() {
  const pending=await read(join(privateDir,'pending.json'));
  if(pending.channelId!==channelId || Date.now()-Date.parse(pending.scanned_at)>30*60000) throw Error('Scan missing or older than 30 minutes; scan again');
  const ignored=await read(join(privateDir,'ignored.json'),{});
  if(pending.unresolved.some(item=>!ignored[item.url])) throw Error('Review unresolved URLs before applying');
  const candidate=validateCreators(pending.candidate), existing=validateCreators(await read(join(root,'creators.json')));
  if(hash(candidate.creators)===hash(existing.creators)) { console.log('{"changed":false}'); return; }
  candidate.updated_at=new Date().toISOString();
  await writeFile(join(root,'creators.json'),JSON.stringify(candidate,null,2)+'\n');
  console.log(JSON.stringify({changed:true,creators:candidate.creators.length}));
}
async function ack() {
  const pending=await read(join(privateDir,'pending.json'));
  const ignored=await read(join(privateDir,'ignored.json'),{});
  if(pending.channelId!==channelId || pending.unresolved.some(item=>!ignored[item.url])) throw Error('Unreviewed source scan');
  const local=validateCreators(await read(join(root,'creators.json'))), live=validateCreators(await publicJson(origin+'/creators.json'));
  if(hash(local)!==hash(live) || hash(local.creators)!==hash(validateCreators(pending.candidate).creators)) throw Error('Deployed directory does not match this scan; checkpoint unchanged');
  await save('checkpoint.json',{version:1,channelId,source_hash:pending.source_hash,scanned_at:pending.scanned_at,acknowledged_at:new Date().toISOString(),published_hash:hash(local),creators:local.creators.length});
  console.log(JSON.stringify({acknowledged:true,creators:local.creators.length}));
}
try {
  const command=process.argv[2]||'scan';
  if(command==='scan') await scan();
  else if(command==='apply') await apply();
  else if(command==='ack') await ack();
  else if(command==='ignore') {
    const [url,reason]=process.argv.slice(3); if(!url?.startsWith('https://')||!reason?.trim()) throw Error('Provide URL and exclusion reason');
    const ignored=await read(join(privateDir,'ignored.json'),{}); ignored[url]={reason:reason.slice(0,300),reviewed_at:new Date().toISOString()}; await save('ignored.json',ignored);
    console.log('{"ignored":true}');
  } else throw Error('Usage: node scripts/scan-creators.mjs scan|apply|ack|ignore URL REASON');
} catch(error) { console.error(String(error.message).slice(0,400)); process.exitCode=1; }
