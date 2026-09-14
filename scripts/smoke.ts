import { callTracker } from '../src/bridge.js';
const key = process.argv[2];
if (!key) throw new Error('Usage: npm run smoke -- DEMO-123 [attachmentId]');
const result = await callTracker('tracker_get_issue', {issueKey:key});
if (result.isError) { console.error('MCP issue read failed; check configuration and access.'); process.exitCode=1; }
else {
  const content = result.content as {type:string;text:string}[];
  const data = JSON.parse(content[0].text);
  console.log(JSON.stringify({key:data.issue?.key,comments:data.comments?.length,attachments:data.attachments?.length,complete:data.complete,truncated:data.truncated}));
  if (process.argv[3]) {
    const file = await callTracker('tracker_download_attachment',{issueKey:key,attachmentId:process.argv[3]});
    if (file.isError) {console.error('MCP download failed.');process.exitCode=1;}
    else console.log((file.content as {text:string}[])[0].text);
  }
}
