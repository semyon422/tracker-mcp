import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Tracker, issueKey, trustedUrl, safeError } from '../src/tracker.js';

const json = (data: unknown, headers = {}) => new Response(JSON.stringify(data), {headers});
function fake(responses: Response[], dir = tmpdir()) {
  const calls: string[] = [];
  const request: typeof fetch = async (url, options) => {
    calls.push(String(url)); assert.equal(options?.method, 'GET'); assert.equal(options?.redirect, 'error');
    return responses.shift()!;
  };
  return {tracker:new Tracker('test-secret', '123', 'X-Org-ID', dir, request), calls};
}
test('key normalization and URL restrictions', () => {
  assert.equal(issueKey(' demo-123 '), 'DEMO-123');
  for (const key of ['../env', 'DEMO-1/x', 'DEMO-0']) assert.throws(() => issueKey(key));
  for (const url of ['https://evil.test/x', '//evil.test/x', 'https://user@api.tracker.yandex.net/x']) assert.throws(() => trustedUrl(url));
});
test('all fields, paginated comments, attachment relations preserved', async () => {
  const {tracker} = fake([json({key:'DEMO-1',customField:'value'}),
    json([{id:1,text:'first'}], {link:'<https://api.tracker.yandex.net/v3/issues/DEMO-1/comments?id=1>; rel="next"'}),
    json([{id:2,text:'second'}], {link:'<https://api.tracker.yandex.net/v3/issues/DEMO-1/comments?id=2>; rel="next"'}),
    json([]), json([{id:'3',commentId:2}]), json([{id:'4',direction:'outward',type:{id:'relates',outward:'related'},object:{key:'DEMO-2'}}])]);
  const result = await tracker.getIssue('DEMO-1');
  assert.equal(result.comments.length, 2); assert.equal(result.issue.customField, 'value');
  assert.equal(result.attachments[0].commentId, 2); assert.equal(result.complete, true);
  assert.equal(result.relatedIssues[0].issue.key, 'DEMO-2');
  assert.equal(result.relatedIssues[0].direction, 'outward');
});
test('cross-origin pagination rejected before sending credentials', async () => {
  const {tracker,calls} = fake([json([{id:1}],{link:'<https://evil.test/x>; rel="next"'})]);
  await assert.rejects(tracker.list('/v3/issues/DEMO-1/comments'), /Unsafe/); assert.equal(calls.length,1);
});
test('HTTP errors do not echo response body or token', async () => {
  for (const status of [401,403,404,429,500]) {
    const {tracker} = fake([new Response('test-secret', {status, headers:{'retry-after':'120'}})]);
    await assert.rejects(tracker.getIssue('DEMO-1'), e => { assert(!safeError(e).includes('test-secret')); return true; });
  }
  assert(!safeError(new Error('test-secret')).includes('test-secret'));
});
test('download streams to safe unique path and verifies size', async () => {
  const dir = await mkdtemp(join(tmpdir(),'tracker-test-'));
  try {
    const {tracker} = fake([json([{id:'1',name:'../../evil.mkv',size:3,content:'https://api.tracker.yandex.net/v3/attachments/1/file'}]),new Response('abc')],dir);
    const result = await tracker.download('DEMO-1','1');
    assert.equal(await readFile(result.path,'utf8'),'abc'); assert.equal(result.bytes,3);
    assert.equal(result.sha256.length,64); assert(result.path.startsWith(dir));
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('size mismatch cleans partial file', async () => {
  const dir = await mkdtemp(join(tmpdir(),'tracker-test-'));
  try {
    const {tracker} = fake([json([{id:'1',name:'x',size:5,content:'/v3/attachments/1/file'}]),new Response('abc')],dir);
    await assert.rejects(tracker.download('DEMO-1','1'), /size/); assert.deepEqual(await readdir(dir),[]);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('unknown attachment never downloaded', async () => {
  const {tracker,calls} = fake([json([])]);
  await assert.rejects(tracker.download('DEMO-1','2'), /belong/); assert.equal(calls.length,1);
});
