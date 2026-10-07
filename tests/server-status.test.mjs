import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeStatus, statusView } from '../server-status-data.js';
import handler, { decodeTracker } from '../api/server-status.js';

const now = Date.parse('2026-10-06T23:57:30Z');
const row = { region:'NAE', serverId:2106, name:'Azphel', faction:'Asmodian', state:'live',
  isRunning:true, inMaintenance:false, creationBlocked:false, observedAt:'2026-10-06T23:57:08Z' };
const payload = (server = row, region = {}) => ({regions:[{code:'NAE', state:'live', servers:[server], ...region}]});
function html(data) {
  const buf = Buffer.from(JSON.stringify(data));
  const key = [154,60,87,241,40,189,100,14];
  for (let i=0; i<buf.length; i++) buf[i] ^= key[i%key.length];
  return `<script>data:{payload:"${buf.toString('base64').split('').reverse().join('')}"}</script>`;
}

test('decodes public tracker serialization without evaluating script', () => {
  assert.deepEqual(decodeTracker(html(payload())), payload());
  assert.throws(()=>decodeTracker('<h1>Just a moment</h1>'));
  assert.throws(()=>decodeTracker('<script>payload:"bad!"</script>'));
});
test('requires explicit creation permission independently of online state', () => {
  assert.equal(normalizeStatus(payload(), '2106', now).creation, 'open');
  assert.equal(normalizeStatus(payload({...row, creationBlocked:true}), '2106', now).creation, 'blocked');
  for (const flag of [undefined, null, 'false', 0]) {
    assert.equal(normalizeStatus(payload({...row, creationBlocked:flag}), '2106', now).creation, 'unknown');
  }
});
test('offline and maintenance cannot be open even when creation is unblocked', () => {
  for (const change of [{isRunning:false}, {inMaintenance:true}, {state:'maintenance'}]) {
    const result = normalizeStatus(payload({...row,...change}), '2106', now);
    assert.equal(result.creation, 'unavailable');
    assert.notEqual(result.serverStatus, 'online');
  }
});
test('stale, missing, future and invalid timestamps cannot look current', () => {
  for (const observedAt of ['2026-10-06T23:55:29Z', '2026-10-07T00:00:00Z', null, 'bad']) {
    assert.equal(normalizeStatus(payload({...row, observedAt}), '2106', now).creation, 'unknown');
  }
  assert.equal(normalizeStatus(payload({...row,state:'stale'}), '2106', now).creation,'unknown');
  assert.equal(normalizeStatus(payload(row,{state:'stale'}), '2106', now).creation,'unknown');
});
test('validates region, server ID, name, faction and unique row', () => {
  for (const change of [{region:'EU'}, {serverId:2101}, {name:'Israphel'}, {faction:'Elyos'}]) {
    assert.equal(normalizeStatus(payload({...row,...change}), '2106', now).creation,'unknown');
  }
  assert.equal(normalizeStatus(payload(row,{servers:[row,row]}),'2106',now).creation,'unknown');
  assert.equal(normalizeStatus({},'2106',now).creation,'unknown');
});
test('browser stops showing open when data expires or is malformed', () => {
  const data = normalizeStatus(payload(),'2106',now);
  assert.equal(statusView(data,now).creation,'Open');
  assert.equal(statusView(data,now+121000).creation,'Status unavailable');
  assert.equal(statusView({...data,observedAt:null},now).creation,'Status unavailable');
  assert.equal(statusView({...data,serverStatus:'offline'},now).creation,'Unavailable while offline');
});

async function request(query={}) {
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;}};
  await handler({method:'GET',query},res);
  return res;
}
test('API returns source time and caches fresh default Azphel status briefly',async t=>{
  t.mock.method(Date,'now',()=>now);
  t.mock.method(globalThis,'fetch',async()=>new Response(html(payload())));
  const res=await request();
  assert.equal(res.statusCode,200);
  assert.equal(res.body.creation,'open');
  assert.equal(res.body.observedAt,row.observedAt);
  assert.match(res.headers['Cache-Control'],/s-maxage=20/);
});
test('API rejects unknown servers before fetching',async t=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('');});
  assert.equal((await request({server:'https://bad.invalid'})).statusCode,400);
  assert.equal(calls,0);
});
test('API source failures and stale payloads are unknown and never cached',async t=>{
  t.mock.method(Date,'now',()=>now);
  for(const response of [new Response('blocked',{status:403}),new Response('<h1>challenge</h1>'),new Response(html(payload({...row,observedAt:'2026-10-05T23:57:08Z'})))]) {
    t.mock.method(globalThis,'fetch',async()=>response);
    const res=await request();
    assert.equal(res.statusCode,503);
    assert.equal(res.body.creation,'unknown');
    assert.equal(res.headers['Cache-Control'],'no-store');
  }
});
