import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as rosterTools from '../member-roster.js';
const {validateRoster, findMember} = rosterTools;
import {mkdtemp, mkdir, copyFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const member = {slug:'char-nae-2106-abc123',name:'NewMember',className:'Cleric',serverId:'2106',serverName:'Azphel',region:'nae',profileId:'public+id=',portrait:'https://profileimg.plaync.com/avatar.png'};
const roster = entries => ({schema_version:1,members:entries});

const alt = {...member,slug:'alt-cleric',name:'AltCleric',profileId:'alt-public-id='};

test('alts resolve to independent profiles while the roster still counts mains only',()=>{
  const values=validateRoster(roster([{...member,alts:[alt]}]));
  assert.equal(values.length,1);
  assert.equal(findMember(values,'ALT-CLERIC').profileId,alt.profileId);
  assert.equal(findMember(values,undefined).slug,member.slug);
  assert.deepEqual(rosterTools.allCharacters(values).map(x=>x.slug),[member.slug,alt.slug]);
  assert.deepEqual(rosterTools.findCharacterFamily(values,alt.slug),{main:values[0],alts:values[0].alts});
  assert.equal(rosterTools.findCharacterFamily(values,'missing'),undefined);
  assert.ok(Object.isFrozen(values[0].alts));
  assert.ok(Object.isFrozen(values[0].alts[0]));
});

test('alt identities and slugs must be globally unique and nested private data is rejected',()=>{
  for(const alts of [null,{},'bad',[member],[{...alt,slug:member.slug}],[{...alt,profileId:member.profileId}],
      [alt,alt],[{...alt,user_id:'private'}],[{...alt,alts:[]}],[{...alt,portrait:'https://evil.test/x'}]]) {
    assert.throws(()=>validateRoster(roster([{...member,alts}])));
  }
  assert.throws(()=>validateRoster(roster([{...member,alts:[alt]},alt])));
  const other={...member,slug:'another-main',profileId:'different='};
  assert.throws(()=>validateRoster(roster([{...member,alts:[alt]},{...other,alts:[alt]}])));
  assert.doesNotThrow(()=>validateRoster(roster([{...member,alts:[]}])));
});

test('new approved characters and duplicate names on different servers have distinct profile routes',()=>{
  const other={...member,slug:'char-nae-2102-def456',serverId:'2102',serverName:'Zikel',profileId:'another='};
  const values=validateRoster(roster([member,other]));
  assert.equal(findMember(values,member.slug.toUpperCase()).profileId,member.profileId);
  assert.equal(findMember(values,other.slug).serverId,'2102');
  assert.equal(findMember(values,'__proto__'),undefined);
  assert.equal(findMember(values,[]),undefined);
});

test('roster rejects private fields, invalid identities and unsafe portrait URLs',()=>{
  for (const invalid of [{...member,user_id:'secret'},{...member,region:'kr'},{...member,slug:'../escape'},{...member,serverId:'https://host'},{...member,portrait:'javascript:alert(1)'},{...member,portrait:'https://profileimg.plaync.com.evil.test/x'}]) {
    assert.throws(()=>validateRoster(roster([invalid])));
  }
  assert.throws(()=>validateRoster(roster([member,member])));
  assert.throws(()=>validateRoster(roster([member,{...member,slug:'different'}])));
});

test('an empty roster and a character without a portrait remain valid',()=>{
  assert.deepEqual(validateRoster(roster([])),[]);
  assert.equal(findMember([],undefined),undefined);
  assert.equal(validateRoster(roster([{...member,portrait:''}]))[0].portrait,'');
});

test('publishing a new roster entry enables its live profile API without a code edit',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'exalted-roster-test-'));
  t.after(async()=>{
    assert.ok(resolve(directory).startsWith(resolve(tmpdir())+'\\') || resolve(directory).startsWith(resolve(tmpdir())+'/'));
    await rm(directory,{recursive:true,force:true});
  });
  await mkdir(join(directory,'api'));
  await writeFile(join(directory,'package.json'),'{"type":"module"}');
  for(const file of ['members.js','member-roster.js','api/aion2.js']) await copyFile(new URL('../'+file,import.meta.url),join(directory,file));
  await writeFile(join(directory,'members.json'),JSON.stringify(roster([{...member,alts:[alt]}])));
  const {default:handler}=await import(pathToFileURL(join(directory,'api/aion2.js')).href);
  const requests=[];
  t.mock.method(globalThis,'fetch',async input=>{
    const url=new URL(input); requests.push(url);
    assert.equal(url.searchParams.get('serverId'),alt.serverId);
    if(url.hostname==='api-search.plaync.com') return Response.json({list:[{name:alt.name,serverId:alt.serverId,region:'nae',characterId:encodeURIComponent(alt.profileId)}]});
    assert.equal(url.searchParams.get('characterId'),alt.profileId);
    return Response.json({profile:{characterName:alt.name}});
  });
  const response={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler({query:{member:alt.slug,type:'info'}},response);
  assert.equal(response.code,200);
  assert.equal(response.body.profile.characterName,alt.name);
  assert.equal(requests.length,2);
});
