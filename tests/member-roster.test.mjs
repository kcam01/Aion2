import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateRoster, findMember} from '../member-roster.js';
import {mkdtemp, mkdir, copyFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const member = {slug:'char-nae-2106-abc123',name:'NewMember',className:'Cleric',serverId:'2106',serverName:'Azphel',region:'nae',profileId:'public+id=',portrait:'https://profileimg.plaync.com/avatar.png'};
const roster = entries => ({schema_version:1,members:entries});

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
  await writeFile(join(directory,'members.json'),JSON.stringify(roster([member])));
  const {default:handler}=await import(pathToFileURL(join(directory,'api/aion2.js')).href);
  const requests=[];
  t.mock.method(globalThis,'fetch',async input=>{
    const url=new URL(input); requests.push(url);
    assert.equal(url.searchParams.get('serverId'),member.serverId);
    if(url.hostname==='api-search.plaync.com') return Response.json({list:[{name:member.name,serverId:member.serverId,region:'nae',characterId:encodeURIComponent(member.profileId)}]});
    assert.equal(url.searchParams.get('characterId'),member.profileId);
    return Response.json({profile:{characterName:member.name}});
  });
  const response={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler({query:{member:member.slug,type:'info'}},response);
  assert.equal(response.code,200);
  assert.equal(response.body.profile.characterName,member.name);
  assert.equal(requests.length,2);
});
