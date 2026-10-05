import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../api/aion2.js';

const characterId = 'Zsn8h9AG5LlhlxxIRVIxDk4PBUQpNQEmlWjvWQNCGCM=';
const foundId = 'resolved+character/token=';
const profile = { profile: { characterName: 'KcamYazimoto', characterLevel: 17 } };
const equipment = { equipment: { equipmentList: [{ name: 'Strange Karma Mace' }] } };

async function request(type, member) {
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  await handler({ query: { type, member } }, response);
  return response;
}

// Contract verified against PLAYNC's public Global character client and live API.
function mockPlaync(t, { searchStatus = 200, characterStatus = 200, searchList, serverId = '2106', characterName = 'KcamYazimoto' } = {}) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    requests.push({ url, options });
    if (url.origin === 'https://api-search.plaync.com' &&
        url.pathname === '/aion2global/search/v2/character' &&
        url.searchParams.get('region') === 'nae' &&
        url.searchParams.get('localeInfo') === 'en-US') {
      return Response.json({ list: searchList ?? [{
        name: `<strong>${characterName}</strong>`, serverId: Number(serverId), region: 'nae',
        characterId: encodeURIComponent(foundId),
      }] }, { status: searchStatus });
    }
    const type = url.pathname.match(/^\/api\/character\/(info|equipment)$/)?.[1];
    if (url.origin === 'https://aion2.plaync.com' && type &&
        url.searchParams.get('region') === 'nae' &&
        url.searchParams.get('lang') === 'en-US' &&
        url.searchParams.get('serverId') === serverId) {
      return Response.json(characterStatus === 200 ? (type === 'info' ? { profile: { ...profile.profile, characterName } } : equipment) :
        { error: 'Upstream unavailable' }, { status: characterStatus });
    }
    return Response.json({ error: 'No matching Global endpoint' }, { status: 404 });
  });
  return requests;
}

for (const type of ['info', 'equipment']) {
  test(`${type} returns the Global NA East data using the resolved character ID`, async t => {
    const requests = mockPlaync(t);
    const response = await request(type);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, type === 'info' ? profile : equipment);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].url.searchParams.get('characterId'), foundId,
      'The encoded search token must be decoded once before URLSearchParams encodes it');
    assert.match(response.headers['Cache-Control'], /s-maxage=300/);
  });
}

test('a failed search still loads the known official profile', async t => {
  const requests = mockPlaync(t, { searchStatus: 503 });
  const response = await request('info');
  assert.equal(response.statusCode, 200);
  assert.equal(requests.at(-1).url.searchParams.get('characterId'), characterId);
});

test('a same-name result from another region is not used', async t => {
  const requests = mockPlaync(t, { searchList: [{
    name: 'KcamYazimoto', serverId: 2106, region: 'eu', characterId: 'wrong-character',
  }] });
  assert.equal((await request('info')).statusCode, 200);
  assert.equal(requests.at(-1).url.searchParams.get('characterId'), characterId);
});

test('upstream failures stay visible and are not cached as successful data', async t => {
  mockPlaync(t, { characterStatus: 503 });
  const response = await request('info');
  assert.equal(response.statusCode, 502);
  assert.equal(response.body.upstreamStatus, 503);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('unsupported request types are rejected without contacting PLAYNC', async t => {
  const requests = mockPlaync(t);
  const response = await request('../other');
  assert.equal(response.statusCode, 400);
  assert.equal(requests.length, 0);
});

for (const member of ['sarcodine', 'char-nae-2106-ad98f4dc135a131f566a']) {
  for (const type of ['info', 'equipment']) {
    test(`Sarcodine ${type} uses Azphel through ${member}`, async t => {
      const requests = mockPlaync(t, { serverId: '2106', characterName: 'Sarcodine' });
      const response = await request(type, member);
      assert.equal(response.statusCode, 200);
      assert.equal(requests[0].url.searchParams.get('keyword'), 'Sarcodine');
      assert.equal(requests[0].url.searchParams.get('serverId'), '2106');
      assert.equal(requests[1].url.searchParams.get('serverId'), '2106');
      assert.equal(requests[1].url.searchParams.get('characterId'), foundId);
      if (type === 'info') assert.equal(response.body.profile.characterName, 'Sarcodine');
    });
  }
}

test('Sarcodine search failure uses Sarcodine official profile, never KcamYazimoto', async t => {
  const requests = mockPlaync(t, { searchStatus: 503, serverId: '2106', characterName: 'Sarcodine' });
  assert.equal((await request('info', 'sarcodine')).statusCode, 200);
  assert.equal(requests.at(-1).url.searchParams.get('characterId'), 'Zsn8h9AG5LlhlxxIRVIxDgctVKBYNhFB2BOy75t5Y3A=');
});

test('the old Zikel character cannot replace Sarcodine on Azphel', async t => {
  const requests = mockPlaync(t, {characterName:'Sarcodine', searchList:[{
    name:'Sarcodine', serverId:2102, region:'nae', characterId:'old-zikel-character'
  }]});
  assert.equal((await request('info', 'sarcodine')).statusCode, 200);
  assert.equal(requests.at(-1).url.searchParams.get('characterId'), 'Zsn8h9AG5LlhlxxIRVIxDgctVKBYNhFB2BOy75t5Y3A=');
});

test('the existing KcamYazimoto URL resolves the Azphel character', async t => {
  const requests = mockPlaync(t);
  const response = await request('info', 'kcamyazimoto');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, profile);
  assert.equal(requests[0].url.searchParams.get('serverId'), '2106');
  assert.equal(requests[1].url.searchParams.get('serverId'), '2106');
});

test('the separate Israphel character cannot replace the approved Azphel profile', async t => {
  const requests = mockPlaync(t, {searchList: [{name:'KcamYazimoto', serverId:2101, region:'nae', characterId:'old-israphel-character'}]});
  assert.equal((await request('info', 'kcamyazimoto')).statusCode, 200);
  assert.equal(requests.at(-1).url.searchParams.get('characterId'), characterId);
});

for (const member of ['unknown', '__proto__', ['sarcodine', 'kcamyazimoto']]) {
  test(`invalid member ${JSON.stringify(member)} is rejected without contacting PLAYNC`, async t => {
    const requests = mockPlaync(t);
    const response = await request('info', member);
    assert.equal(response.statusCode, 400);
    assert.equal(requests.length, 0);
  });
}
