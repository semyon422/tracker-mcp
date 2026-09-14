import {setTimeout as sleep} from 'node:timers/promises';

const statuses = new Set([429, 502, 503, 504]);
const codes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET']);
function transient(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as {name?:string; code?:string; cause?:{code?:string}};
  return e.name === 'TimeoutError' || codes.has(e.code ?? e.cause?.code ?? '');
}
export function retryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  if (/^\d+(\.\d+)?$/.test(value.trim())) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}
// Retries only obtaining response headers. Body failures are not replayed here.
export async function fetchWithRetry(url: URL, init: RequestInit, request: typeof fetch = fetch,
  wait: (ms:number, signal?:AbortSignal) => Promise<void> = async (ms, signal) => {await sleep(ms, undefined, {signal});}) {
  const caller = init.signal ?? undefined;
  for (let attempt = 0; ; attempt++) {
    caller?.throwIfAborted();
    let response: Response;
    try {
      response = await request(url, {...init, signal:AbortSignal.any([
        AbortSignal.timeout(60_000), ...(caller ? [caller] : []),
      ])});
    } catch (error) {
      caller?.throwIfAborted();
      if (attempt >= 2 || !transient(error)) throw error;
      await wait(500 * 2 ** attempt + Math.floor(Math.random() * 250), caller);
      continue;
    }
    if (!statuses.has(response.status) || attempt >= 2) return response;
    const delay = retryAfter(response.headers.get('retry-after'));
    // Do not retry earlier than the server requested; long delays are left to the user.
    if (delay !== undefined && delay > 30_000) return response;
    await response.body?.cancel();
    await wait(Math.max(delay ?? 0, 500 * 2 ** attempt + Math.floor(Math.random() * 250)), caller);
  }
}
