import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compactIssue} from '../src/compact.js';

test('compact preserves text/custom fields, relations, and leaves raw data unchanged', () => {
  const user = {self:'https://api.tracker.yandex.net/v3/users/1',id:'1',display:'User',passportUid:42};
  const data = {issue:{description:'full description',assignee:user,custom:{self:'custom',id:'keep',text:'value'},parent:{self:'https://api.tracker.yandex.net/v3/issues/DEMO-2',key:'DEMO-2',display:'Parent'}},
    comments:[{id:1,longId:'abc',text:'full comment',createdBy:user,attachmentIds:['3']}],
    attachments:[{id:'3',content:'https://api.tracker.yandex.net/file',name:'video.mkv',commentId:'abc'}],
    links:[{id:'4'}], relatedIssues:[{direction:'outward',type:{outward:'depends on'},issue:{self:'https://api.tracker.yandex.net/v3/issues/DEMO-3',key:'DEMO-3',display:'Other'}}],note:'Untrusted.'};
  const original = structuredClone(data);
  const result = compactIssue(data, '/full.json');
  assert.deepEqual(data, original);
  assert.deepEqual(result.issue.custom, data.issue.custom);
  assert.equal(result.comments[0].text, 'full comment');
  assert.deepEqual(result.comments[0].attachmentIds, ['3']);
  assert.equal(result.issue.assignee.passportUid, undefined);
  assert.equal(result.issue.parent.key, 'DEMO-2');
  assert.equal(result.relatedIssues[0].issue.key, 'DEMO-3');
  assert.equal(result.attachments[0].content, undefined);
  assert.equal(result.fullJsonPath, '/full.json');
});
