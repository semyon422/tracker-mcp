import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Tracker} from '../src/tracker.js';
const path = 'https://api.tracker.yandex.net/v3/issues/DEMO-1/changelog';
test('history preserves old/new values and follows cursor explicitly', async () => {
  let calls=0;
  const entry={id:'abc',updatedAt:'date',updatedBy:{display:'User'},fields:[{field:{id:'status'},from:null,to:{key:'open'}}],links:[]};
  const tracker=new Tracker('secret','1','X-Org-ID','unused',async (url,init) => {
    assert.equal(init?.method,'GET');calls++;
    if(calls===2) assert.equal(new URL(String(url)).searchParams.get('id'),'abc');
    return new Response(JSON.stringify(calls===1?[entry]:[]),{headers:{link:`<${path}?id=abc&perPage=2>; rel="next"`}});
  });
  const first=await tracker.history('demo-1',{perPage:2});
  assert.deepEqual(first.entries,[entry]);assert.equal(first.nextCursor,'abc');assert.equal(calls,1);
  const last=await tracker.history('DEMO-1',{cursor:first.nextCursor!,perPage:2});
  assert.equal(last.hasNextPage,false);assert.equal(last.nextCursor,null);
});
test('invalid cursor and unsafe or looping pagination rejected', async () => {
  const tracker=new Tracker('secret','1','X-Org-ID','unused',async () => {throw Error('unexpected request');});
  await assert.rejects(tracker.history('DEMO-1',{cursor:'../secret'}),/cursor/);
  await assert.rejects(tracker.history('DEMO-1',{perPage:51}),/perPage/);
  for(const next of ['https://evil.test/?id=abc',path+'?id=abc',path.replace('DEMO-1','DEMO-2')+'?id=xyz']) {
    const client=new Tracker('secret','1','X-Org-ID','unused',async () => new Response('[{"id":"abc"}]',{headers:{link:`<${next}>; rel="next"`}}));
    await assert.rejects(client.history('DEMO-1',{cursor:'abc'}),/Unsafe|pagination/);
  }
});
