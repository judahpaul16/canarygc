import { createHash } from 'node:crypto';

// A small in-memory TTL cache for the map-overlay endpoints. The station runs
// as a single Node process, so a process-local map is the right fit: no network
// hop, and it dies with the process (the data is public and cheap to refetch).
// A shared cache like Redis only earns its cost across multiple instances.

interface Entry {
  value: unknown;
  expires: number;
}

const store = new Map<string, Entry>();
const MAX_ENTRIES = 500;

// Round the bbox so nearby viewports share an entry, which keeps small pans from
// each hitting the upstream API.
export function bboxKey(prefix: string, bbox: string): string {
  const rounded = bbox
    .split(',')
    .map((n) => Number(n).toFixed(3))
    .join(',');
  return `${prefix}:${rounded}`;
}

// Content-addressed JSON response for endpoints whose data changes on cache
// TTLs rather than per request, so a repeat poll of unchanged data costs a 304
// and headers instead of the body. The weak validator survives nginx's gzip,
// which drops strong ETags when it rewrites a response.
export function etagJson(request: Request, data: unknown): Response {
  const body = JSON.stringify(data);
  const etag = `W/"${createHash('sha1').update(body).digest('base64url')}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }
  return new Response(body, {
    headers: { 'content-type': 'application/json', etag }
  });
}

export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as T;

  const value = await fetcher();
  store.set(key, { value, expires: now + ttlMs });

  if (store.size > MAX_ENTRIES) {
    for (const [k, entry] of store) {
      if (entry.expires <= now) store.delete(k);
    }
    while (store.size > MAX_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest);
    }
  }

  return value;
}
