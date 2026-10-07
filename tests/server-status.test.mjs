import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeStatus, statusView, SOURCE_URL } from '../server-status-data.js';
import handler from '../api/server-status.js';

const now = Date.parse('2026-10-07T00:16:30Z');
const row = { region:'nae', serverId:2106, name:'Azphel', race:2,
  isRunning:true, inMaintenance:false, tags:1, updatedAt:'2026-10-07T00:15:00.000Z' };
const payload = (server = row) => ({result:{data:{servers:[server]}}});

test('reads Questlog creation-lock bit independently of online and other tags', () => {
  for (const tags of [0,1,2,3,8]) assert.equal(normalizeStatus(payload({...row,tags}),'2106',now).creation,'open');
  for (const tags of [4,5,6,7,12]) assert.equal(normalizeStatus(payload({...row,tags}),'2106',now).creation,'blocked');
  for (const tags of [undefined,null,'0',false,-1,1.5,4294967296]) {
    assert.equal(normalizeStatus(payload({...row,tags}),'2106',now).creation,'unknown');
  }
});
test('uses Questlog source links and retains source time separately from check time', () => {
  const data=normalizeStatus(payload(),'2106',now);
  assert.equal(data.sourceName,'Questlog');
  assert.equal(data.sourceUrl,'https://questlog.gg/aion-2/en/server-status');
  assert.equal(data.sourceUrl,SOURCE_URL);
  assert.equal(data.observedAt,row.updatedAt);
  assert.equal(data.checkedAt,new Date(now).toISOString());
});
test('offline and maintenance cannot be open even when the lock bit is unset', () => {
  for (const change of [{isRunning:false},{inMaintenance:true}]) {
    const result=normalizeStatus(payload({...row,...change}),'2106',now);
    assert.equal(result.creation,'unavailable');
    assert.notEqual(result.serverStatus,'online');
  }
  for (const change of [{isRunning:'true'},{inMaintenance:null}]) {
    assert.equal(normalizeStatus(payload({...row,...change}),'2106',now).creation,'unknown');
  }
});
test('accepts five-minute source time skew but rejects stale or excessively future reports', () => {
  assert.equal(normalizeStatus(payload({...row,updatedAt:'2026-10-07T00:12:00Z'}),'2106',now).creation,'open');
  assert.equal(normalizeStatus(payload({...row,updatedAt:'2026-10-07T00:20:00Z'}),'2106',now).creation,'open');
  assert.equal(normalizeStatus(payload({...row,updatedAt:'2026-10-07T00:21:30Z'}),'2106',now).creation,'open');
  for (const updatedAt of ['2026-10-07T00:11:29Z','2026-10-07T00:21:31Z',null,'bad']) {
    assert.equal(normalizeStatus(payload({...row,updatedAt}),'2106',now).creation,'unknown');
  }
});
test('validates region, server ID, name, faction and unique row', () => {
  for (const change of [{region:'eu'},{serverId:2101},{name:'Israphel'},{race:1},{race:'2'}]) {
    assert.equal(normalizeStatus(payload({...row,...change}),'2106',now).creation,'unknown');
  }
  assert.equal(normalizeStatus({result:{data:{servers:[row,row]}}},'2106',now).creation,'unknown');
  for (const data of [{},null,{result:{data:{servers:{}}}},{error:{message:'Unavailable'}}]) {
    assert.equal(normalizeStatus(data,'2106',now).creation,'unknown');
  }
  const siel=normalizeStatus(payload({...row,serverId:1101,name:'Siel',race:1,tags:4}),'1101',now);
  assert.equal(siel.creation,'blocked');
  assert.equal(siel.faction,'Elyos');
});
test('browser rechecks age and does not present invalid data as open', () => {
  const data=normalizeStatus(payload(),'2106',now);
  assert.equal(statusView(data,now).creation,'Open');
  assert.equal(statusView(data,now+301000).creation,'Status unavailable');
  assert.equal(statusView({...data,observedAt:null},now).creation,'Status unavailable');
  assert.equal(statusView({...data,observedAt:'2026-10-07T00:20:00Z'},now).creation,'Open');
  assert.equal(statusView({...data,observedAt:'2026-10-07T00:21:31Z'},now).creation,'Status unavailable');
  assert.equal(statusView({...data,serverStatus:'offline'},now).creation,'Unavailable while offline');
});

async function request(query={},method='GET') {
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;}};
  await handler({method,query},res);
  return res;
}
test('API reads Questlog JSON directly and briefly caches a fresh default Azphel report',async t=>{
  t.mock.method(Date,'now',()=>now);
  let url;
  t.mock.method(globalThis,'fetch',async(input)=>{url=String(input);return Response.json(payload());});
  const res=await request();
  assert.equal(res.statusCode,200);
  assert.equal(url,'https://questlog.gg/aion-2/api/trpc/serverStatus.getServerStatus');
  assert.equal(res.body.creation,'open');
  assert.equal(res.body.observedAt,row.updatedAt);
  assert.match(res.headers['Cache-Control'],/s-maxage=20/);
});
test('API cache lifetime never exceeds remaining report freshness',async t=>{
  t.mock.method(Date,'now',()=>now);
  t.mock.method(globalThis,'fetch',async()=>Response.json(payload({...row,updatedAt:'2026-10-07T00:11:40Z'})));
  assert.match((await request()).headers['Cache-Control'],/s-maxage=10,/);
});
test('API rejects unknown servers and unsupported methods before fetching',async t=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json(payload());});
  assert.equal((await request({server:'https://bad.invalid'})).statusCode,400);
  assert.equal((await request({server:['2106']})).statusCode,400);
  assert.equal((await request({},'POST')).statusCode,405);
  assert.equal(calls,0);
});
test('API errors, malformed and stale data are unknown and never cached',async t=>{
  t.mock.method(Date,'now',()=>now);
  for(const response of [new Response('blocked',{status:403}),new Response('<h1>challenge</h1>'),Response.json(payload({...row,updatedAt:'2026-10-06T00:15:00Z'})),Response.json({error:{message:'Unavailable'}})]) {
    t.mock.method(globalThis,'fetch',async()=>response);
    const res=await request();
    assert.equal(res.statusCode,503);
    assert.equal(res.body.creation,'unknown');
    assert.equal(res.headers['Cache-Control'],'no-store');
  }
});
