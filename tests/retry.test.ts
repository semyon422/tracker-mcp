import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchWithRetry, retryAfter} from '../src/retry.js';
const url = new URL('https://api.tracker.yandex.net/v3/issues/_search');
test('retry-after seconds and dates', () => {
  assert.equal(retryAfter('2'),2000);
  assert.equal(retryAfter('Thu, 01 Jan 1970 00:00:03 GMT',1000),2000);
  assert.equal(retryAfter('invalid'),undefined);
});
test('temporary HTTP failures retried with identical search body', async () => {
  let calls=0; const waits:number[]=[];
  const r = await fetchWithRetry(url,{method:'POST',body:'{"query":"Queue: DEMO"}'},async (_url, init) => {
    assert.equal(init?.body,'{"query":"Queue: DEMO"}');
    calls++; return new Response('',{status:calls===1?429:calls===2?503:200,headers:{'retry-after':'2'}});
  },async ms => {waits.push(ms);});
  assert.equal(r.status,200);assert.equal(calls,3);assert.deepEqual(waits,[2000,2000]);
});
test('network timeouts retried, attempt count bounded', async () => {
  let calls=0;
  await assert.rejects(fetchWithRetry(url,{},async () => {
    calls++;throw new TypeError('fetch failed',{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}});
  },async () => {}));
  assert.equal(calls,3);
});
test('permanent errors and long Retry-After are not retried', async () => {
  for (const status of [400,401,403,404,429]) {
    let calls=0;
    await fetchWithRetry(url,{},async () => {calls++;return new Response('',{status,headers:{'retry-after':'120'}});},async () => {assert.fail('must not wait');});
    assert.equal(calls,1);
  }
  let calls=0;
  await assert.rejects(fetchWithRetry(url,{},async () => {calls++;throw new TypeError('invalid redirect');},async () => {}));
  assert.equal(calls,1);
});
test('cancellation during backoff prevents next request', async () => {
  const controller = new AbortController(); let calls=0;
  await assert.rejects(fetchWithRetry(url,{signal:controller.signal},async () => {
    calls++;return new Response('',{status:503});
  },async (_ms,signal) => {controller.abort();signal?.throwIfAborted();}));
  assert.equal(calls,1);
});
test('already cancelled call never sends a request', async () => {
  await assert.rejects(fetchWithRetry(url,{signal:AbortSignal.abort()},async () => {assert.fail('request sent');}));
});
