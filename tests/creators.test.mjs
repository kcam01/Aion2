import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialAccount, groupCreators, validateCreators, embedUrl, chooseStream } from '../creator-directory.js';
import { parseTwitch, parseYouTube, freshStreams } from '../creator-status-data.js';
import { getStatuses } from '../api/creator-status.js';
import { creatorPosts, assertReadAccess } from '../scripts/creators-scan-core.mjs';

test('canonicalizes public social profiles and rejects lookalikes and non-profile paths', () => {
  assert.deepEqual(socialAccount('https://www.twitch.tv/FubukiShinko?ref=discord'), {platform:'twitch',handle:'fubukishinko',url:'https://www.twitch.tv/fubukishinko'});
  assert.equal(socialAccount('https://twitter.com/Creator/status/123').url,'https://x.com/creator');
  assert.equal(socialAccount('https://youtube.com/@Creator/videos').url,'https://www.youtube.com/@Creator');
  assert.equal(socialAccount('https://tiktok.com/@Creator/video/123').url,'https://www.tiktok.com/@creator');
  for (const url of ['javascript:alert(1)','https://twitch.tv.evil.org/test','https://name:pass@twitch.tv/name','https://twitch.tv:444/name','https://twitch.tv/directory','https://instagram.com/p/123','https://youtube.com/watch?v=abcdefghijk','https://127.0.0.1/name']) assert.equal(socialAccount(url),null,url);
  for (const url of ['https://twitch.tv/','https://kick.com/','https://instagram.com/','https://youtube.com/channel','https://youtube.com/c','https://x.com/','https://bsky.app/profile','https://bsky.app/profile/']) assert.equal(socialAccount(url),null,url);
});

test('groups by the actual Discord author, deduplicates and publishes only approved public character fields', () => {
  const posts=[{authorId:'1',displayName:'Name <one>',accounts:[socialAccount('https://twitch.tv/tester')]},{authorId:'1',displayName:'Name <one>',accounts:[socialAccount('https://twitch.tv/TESTER'),socialAccount('https://x.com/tester')]},{authorId:'2',displayName:'Name <one>',accounts:[socialAccount('https://twitch.tv/tester')]}];
  const roster={members:[{slug:'hero',name:'Hero',region:'nae',serverId:'2106',profileId:'abc',portrait:'',alts:[{slug:'alt',name:'Alt'}]}]};
  const groups=groupCreators(posts,{'1':{region:'nae',server_id:'2106',character_id:'abc'}},roster,{'1':'creator-one','2':'creator-two'});
  assert.equal(groups.length,2); assert.equal(groups[0].accounts.length,2);
  assert.equal(groups[0].character.slug,'hero'); assert.equal(groups[1].character,null);
  assert.equal(JSON.stringify(groups).includes('authorId'),false);
  assert.equal(JSON.stringify(groups).includes('profileId'),false);
  assert.equal(groupCreators([],{},roster,{}).length,0);
});

const now=Date.parse('2026-10-08T18:00:00Z');
const ld=graph=>`<script type="application/ld+json">${JSON.stringify({'@graph':graph})}</script>`;
const profile={'@type':'ProfilePage',mainEntity:{url:'https://www.twitch.tv/tester',name:'Tester'}};
const live={'@type':'VideoObject',description:'AION 2 tonight',embedUrl:'https://player.twitch.tv/?channel=tester',publication:{'@type':'BroadcastEvent',isLiveBroadcast:true,startDate:'2026-10-08T17:00:00Z',endDate:'2026-10-08T23:00:00Z'}};
test('Twitch uses current matching broadcast evidence, never historical video or malformed pages',()=>{
  assert.equal(parseTwitch(ld([profile,live]),'tester',now).state,'live');
  assert.equal(parseTwitch(ld([profile]),'tester',now).state,'offline');
  assert.equal(parseTwitch(ld([profile,{...live,publication:{...live.publication,endDate:'2026-10-08T17:50:00Z'}}]),'tester',now).state,'offline');
  assert.equal(parseTwitch(ld([profile,{...live,embedUrl:'https://player.twitch.tv/?channel=someoneelse'}]),'tester',now).state,'unknown');
  assert.equal(parseTwitch('<html>blocked</html>','tester',now).state,'unknown');
});
test('YouTube requires isLiveNow and a playable video ID, not just isLiveContent',()=>{
  const player={videoDetails:{videoId:'abcdefghijk',title:'Stream',isLiveContent:true},microformat:{playerMicroformatRenderer:{liveBroadcastDetails:{isLiveNow:true}}},playabilityStatus:{status:'OK'}};
  const html=value=>`var ytInitialPlayerResponse = ${JSON.stringify(value)};</script>`;
  assert.equal(parseYouTube(html(player),now).state,'live');
  assert.equal(parseYouTube(html({...player,microformat:{}}),now).state,'unknown');
  assert.equal(parseYouTube(html({...player,microformat:{playerMicroformatRenderer:{liveBroadcastDetails:{isLiveNow:false}}}}),now).state,'offline');
  assert.equal(parseYouTube('<html>consent</html>',now).state,'unknown');
});
test('stale or future data cannot show live and selection preserves an active stream',()=>{
  const streams=[{key:'a',state:'live'},{key:'b',state:'live'}];
  assert.equal(freshStreams({checkedAt:new Date(now).toISOString(),streams},now).length,2);
  assert.equal(freshStreams({checkedAt:new Date(now-180001).toISOString(),streams},now).length,0);
  assert.equal(freshStreams({checkedAt:new Date(now+60001).toISOString(),streams},now).length,0);
  assert.equal(chooseStream(streams,'b').key,'b'); assert.equal(chooseStream(streams,'gone').key,'a'); assert.equal(chooseStream([]),null);
  const url=new URL(embedUrl({platform:'twitch',handle:'tester'},'exalted-aion2.vercel.app'));
  assert.equal(url.searchParams.get('muted'),'true'); assert.equal(url.searchParams.get('autoplay'),'true'); assert.equal(url.searchParams.get('parent'),'exalted-aion2.vercel.app');
});
test('public manifest rejects extra private fields and unsafe accounts',()=>{
  const creator={id:'creator-one',displayName:'Creator',character:null,accounts:[socialAccount('https://twitch.tv/tester')]};
  const data={schema_version:1,updated_at:new Date(now).toISOString(),creators:[creator]};
  assert.equal(validateCreators(data).creators.length,1);
  assert.throws(()=>validateCreators({...data,creators:[{...creator,user_id:'123'}]}));
  assert.throws(()=>validateCreators({...data,creators:[{...creator,accounts:[{platform:'twitch',handle:'tester',url:'https://evil.org'}]}]}));
});

test('scanner resolves YouTube videos once, ignores bots and detects edited or removed links',async()=>{
  let calls=0;
  const resolve=async()=>{calls++;return 'https://www.youtube.com/@Tester';};
  const messages=[{id:'3',author:{id:'1',username:'Member'},content:'[Live](https://twitch.tv/tester) https://youtu.be/abcdefghijk',embeds:[{url:'https://www.youtube.com/watch?v=abcdefghijk'}]},{id:'2',author:{id:'2',username:'Bot',bot:true},content:'https://twitch.tv/bot'}];
  const {posts,unresolved}=await creatorPosts(messages,resolve);
  assert.equal(posts.length,1);assert.equal(calls,1);assert.equal(unresolved.length,0);
  assert.equal(new Set(posts[0].accounts.map(a=>a.url)).size,2);
  assert.equal((await creatorPosts([{...messages[0],content:'removed',embeds:[]}],resolve)).posts.length,0);
  assert.equal((await creatorPosts([],resolve)).posts.length,0);
});
test('status endpoint deduplicates accounts, tolerates partial outages and only requests listed providers',async()=>{
  const make=(id,url)=>({id,displayName:id,character:null,accounts:[socialAccount(url)]});
  const directory={schema_version:1,updated_at:new Date(now).toISOString(),creators:[make('one','https://twitch.tv/tester'),make('two','https://twitch.tv/tester'),make('three','https://youtube.com/@Down'),make('four','https://kick.com/example')]};
  const called=[];
  const result=await getStatuses(directory,async url=>{called.push(url);if(url.includes('youtube'))throw Error('provider outage');return {ok:true,url,text:async()=>ld([profile,live])};},()=>now);
  assert.equal(called.length,2);assert.equal(result.streams.length,3);
  assert.equal(result.streams[0].state,'live');assert.equal(result.streams[1].state,'unknown');assert.equal(result.streams[2].state,'unknown');
  assert.equal(called.some(url=>url.includes('example')),false);
});
test('scanner fails closed when history permission or message content access is lost',()=>{
 const fixture={guildId:'1',botId:'2',member:{roles:['3']},roles:[{id:'1',permissions:'1024'},{id:'3',permissions:'65536'}],channel:{permission_overwrites:[]},application:{flags:1<<19}};
 assert.doesNotThrow(()=>assertReadAccess(fixture));
 assert.throws(()=>assertReadAccess({...fixture,application:{flags:0}}));
 assert.throws(()=>assertReadAccess({...fixture,channel:{permission_overwrites:[{id:'3',type:0,deny:'65536',allow:'0'}]}}));
 assert.throws(()=>assertReadAccess({...fixture,roles:[{id:'1',permissions:'1024'}]}));
 assert.doesNotThrow(()=>assertReadAccess({...fixture,roles:[{id:'1',permissions:'8'}]}));
});
