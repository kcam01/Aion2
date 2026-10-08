import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateCreators} from '../creator-directory.js';
const origin=(process.argv[2]||'https://exalted-aion2.vercel.app').replace(/\/$/,'');
const hash=data=>createHash('sha256').update(data.toString().replaceAll('\r\n','\n')).digest('hex');
for(const file of ['creators.html','creators.css','creators.js','creators.json','creator-directory.js','creator-status-data.js','guild.css','index.html','events.html','builds.html']) {
 const response=await fetch(origin+'/'+(file.endsWith('.html')?file.slice(0,-5):file),{cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error(`${file}: HTTP ${response.status}`);
 const live=await response.text(),local=await readFile(new URL('../'+file,import.meta.url),'utf8');
 const normalize=value=>file.endsWith('.json')?JSON.stringify(JSON.parse(value)):value;
 if(hash(normalize(live))!==hash(normalize(local)))throw Error(`${file}: deployment mismatch`);
 if(file==='creators.json')validateCreators(JSON.parse(live));
}
const response=await fetch(origin+'/api/creator-status',{cache:'no-store',signal:AbortSignal.timeout(20000)});
const status=await response.json();if(!response.ok||!Array.isArray(status.streams)||!Number.isFinite(Date.parse(status.checkedAt)))throw Error('Invalid deployed live status endpoint');
console.log(JSON.stringify({verified:true,origin,checkedAt:status.checkedAt,streams:status.streams.map(s=>({platform:s.platform,handle:s.handle,state:s.state}))},null,2));
