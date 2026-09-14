import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Tracker} from '../src/tracker.js';
test('users search paginates, normalizes ё and returns safe identifiers', async () => {
  let calls=0;
  const client=new Tracker('secret','1','X-Org-ID','unused',async () => {
    calls++;
    return new Response(JSON.stringify(calls===1?[{trackerUid:42,login:'artem',display:'Артём Примеров',email:'private'}]:[{trackerUid:43,login:'other',display:'Другой'}]),{headers:calls===1?{link:'<https://api.tracker.yandex.net/v3/users?page=2>; rel="next"'}:{}});
  });
  const result=await client.findUsers('артем');
  assert.equal(calls,2);assert.equal(result.users[0].id,'42');assert.equal(result.totalMatches,1);
  assert(!JSON.stringify(result).includes('private'));
});
test('empty user query rejected before request', async () => {
  const client=new Tracker('secret','1','X-Org-ID','unused',async () => {throw Error('Unexpected request');});
  await assert.rejects(client.findUsers(' '),/query/);
});
