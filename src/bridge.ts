import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// One short-lived MCP process per tool call: cancellation, reload and session changes
// cannot leave a cached client tied to a previous session.
export async function callTracker(name: string, args: Record<string, unknown>, signal?: AbortSignal) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const client = new Client({name:'pi-tracker-bridge', version:'0.1.0'});
  const transport = new StdioClientTransport({command:process.execPath,
    args:[join(root, 'dist/server.js')], cwd:root, stderr:'pipe'});
  transport.stderr?.on('data', () => {}); // Never expose process diagnostics that might contain secrets.
  try {
    signal?.throwIfAborted();
    await client.connect(transport, {timeout:15_000, signal});
    return await client.callTool({name, arguments:args}, undefined, {signal, timeout:300_000});
  } finally { await client.close().catch(() => {}); await transport.close().catch(() => {}); }
}
