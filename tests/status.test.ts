import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Tracker, safeError} from '../src/tracker.js';
import {compactHistory} from '../src/compact.js';

test('status checks myself and excludes profile and token', async () => {
  const tracker = new Tracker('secret-token','123','X-Org-ID','unused',async (url, options) => {
    assert.equal(new URL(String(url)).pathname,'/v3/myself');
    assert.equal(options?.method,'GET');
    return new Response(JSON.stringify({login:'private-login',email:'private-email'}));
  });
  const result = await tracker.status();
  assert.equal(result.ok,true);assert.equal(result.organizationId,'123');
  assert(!JSON.stringify(result).includes('private'));assert(!JSON.stringify(result).includes('secret-token'));
});
test('status reports auth failure without response body', async () => {
  const tracker = new Tracker('token','123','X-Org-ID','unused',async () => new Response('secret',{status:401}));
  await assert.rejects(tracker.status(), e => safeError(e).includes('401') && !safeError(e).includes('secret'));
});
test('compact history preserves custom changes, links, nulls and cursor without mutation', () => {
  const value={self:'https://api.tracker.yandex.net/custom',id:'x',payload:'keep'};
  const data={entries:[{id:'1',self:'url',issue:{key:'DEMO-1'},updatedBy:{self:'https://api.tracker.yandex.net/v3/users/1',id:'1',display:'User',passportUid:42},fields:[{field:{id:'custom'},from:null,to:value},{field:{id:'status'},from:null,to:{self:'https://api.tracker.yandex.net/v3/statuses/1',key:'open',display:'Open'}}],links:[{from:null,to:value}]}],nextCursor:'next',note:'data'};
  const original=structuredClone(data);const result=compactHistory(data,'/full.json');
  assert.deepEqual(data,original);assert.equal(result.nextCursor,'next');
  assert.deepEqual(result.entries[0].fields[0].to,value);
  assert.equal(result.entries[0].fields[1].from,null);
  assert.deepEqual(result.entries[0].links,data.entries[0].links);
  assert.equal(result.entries[0].issue,undefined);assert.equal(result.entries[0].updatedBy.passportUid,undefined);
  assert.equal(result.fullJsonPath,'/full.json');
});
