import { describe, expect, it } from 'vitest';
import { etagJson } from './geocache';

const data = { zones: [{ name: 'ATL', restricted: false }] };

function requestWith(etag?: string): Request {
  return new Request('http://station/api/airspace', {
    headers: etag ? { 'if-none-match': etag } : {}
  });
}

describe('etagJson', () => {
  it('returns the body with a weak validator', async () => {
    const res = etagJson(requestWith(), data);
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toMatch(/^W\//);
    expect(await res.json()).toEqual(data);
  });

  it('returns 304 with no body on a matching validator', async () => {
    const etag = etagJson(requestWith(), data).headers.get('etag')!;
    const res = etagJson(requestWith(etag), data);
    expect(res.status).toBe(304);
    expect(res.headers.get('etag')).toBe(etag);
    expect(await res.text()).toBe('');
  });

  it('returns fresh data when the content changes', async () => {
    const etag = etagJson(requestWith(), data).headers.get('etag')!;
    const res = etagJson(requestWith(etag), { zones: [] });
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).not.toBe(etag);
  });
});
