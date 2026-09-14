import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Tracker} from '../src/tracker.js';
test('search uses read-only search endpoint, quoted filters, compact pagination', async () => {
  const tracker = new Tracker('secret','1','X-Org-ID','unused', async (url, init) => {
    assert.equal(new URL(String(url)).pathname, '/v3/issues/_search');
    assert.equal(init?.method,'POST');
    const {query} = JSON.parse(String(init?.body));
    assert.equal(query, '"Summary": "a\\\" OR b" AND "Queue": "DEMO"');
    return new Response(JSON.stringify([{key:'DEMO-1',summary:'Title',description:'not returned',status:{display:'Open'}}]),{headers:{'x-total-count':'3'}});
  });
  const result = await tracker.search({text:'a" OR b',queue:'DEMO',perPage:1});
  assert.equal(result.nextPage,2); assert.equal(result.total,3);
  assert.equal(result.issues[0].summary,'Title'); assert(!('description' in result.issues[0]));
});
test('invalid or conflicting filters rejected without HTTP', async () => {
  const tracker = new Tracker('secret','1','X-Org-ID','unused',async () => {throw Error('must not request');});
  await assert.rejects(tracker.search({}), /filter/);
  await assert.rejects(tracker.search({query:'Queue: DEMO',queue:'DEMO'}), /not both/);
  await assert.rejects(tracker.search({queue:'DEMO',page:0}), /Page/);
});
test('advanced query passed verbatim and final page has no next', async () => {
  const tracker = new Tracker('secret','1','X-Org-ID','unused',async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)),{query:'Queue: DEMO AND Status: open'});
    return new Response('[]');
  });
  const result = await tracker.search({query:'Queue: DEMO AND Status: open'});
  assert.equal(result.hasNextPage,false);assert.equal(result.nextPage,null);
});
