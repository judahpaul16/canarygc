import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { cached, etagJson } from '$lib/server/geocache';
import { parseTfrDetail, tfrLink, type Notam, type TfrDetail } from '$lib/notams';

// Active FAA temporary flight restrictions for the vehicle's state, from the
// keyless TFR list. The list carries no coordinates, so the position resolves
// to a US state through the Census Bureau's keyless geocoder and the notices
// filter on it. Each in-state notice is enriched with its detail record, which
// carries the ceiling, the active window, and the controlling center.

const TFR_URL = 'https://tfr.faa.gov/tfrapi/exportTfrList';
const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';

const TFR_TTL_MS = 5 * 60 * 1000;
const STATE_TTL_MS = 24 * 60 * 60 * 1000;
const DETAIL_TTL_MS = 6 * 60 * 60 * 1000;
// A busy state rarely holds more than a handful of active TFRs; the cap bounds
// the per-poll fan-out to the detail endpoint.
const MAX_DETAIL = 10;

interface TfrItem {
  notam_id?: string;
  type?: string;
  state?: string;
  description?: string;
}

async function fetchTfrList(): Promise<TfrItem[]> {
  const res = await fetch(TFR_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000)
  });
  if (!res.ok) throw new Error(`TFR list responded ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchTfrDetail(id: string): Promise<TfrDetail> {
  const res = await fetch(tfrLink(id), { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`TFR detail ${id} responded ${res.status}`);
  return parseTfrDetail(await res.text());
}

async function stateForPoint(lat: number, lon: number): Promise<string | null> {
  const params = new URLSearchParams({
    x: String(lon),
    y: String(lat),
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    layers: 'States',
    format: 'json'
  });
  const res = await fetch(`${CENSUS_URL}?${params}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Census geocoder responded ${res.status}`);
  const data = await res.json();
  const states = data?.result?.geographies?.States;
  const stusab = Array.isArray(states) ? states[0]?.STUSAB : undefined;
  return typeof stusab === 'string' && stusab.length === 2 ? stusab : null;
}

export const GET: RequestHandler = async ({ url, request }) => {
  const lat = parseFloat(url.searchParams.get('lat') ?? '');
  const lon = parseFloat(url.searchParams.get('lon') ?? '');
  if (isNaN(lat) || isNaN(lon)) {
    return json({ state: null, notams: [] as Notam[] });
  }

  // A tenth of a degree keys the state cache; a vehicle does not cross a state
  // line inside that box without also changing the key.
  const stateKey = `notam-state:${lat.toFixed(1)},${lon.toFixed(1)}`;
  let state: string | null = null;
  try {
    state = await cached(stateKey, STATE_TTL_MS, () => stateForPoint(lat, lon));
  } catch (error) {
    console.error('Census state lookup failed:', error);
  }
  if (!state) return json({ state: null, notams: [] as Notam[] });

  let list: TfrItem[] = [];
  try {
    list = await cached('notam-tfr-list', TFR_TTL_MS, fetchTfrList);
  } catch (error) {
    console.error('TFR list fetch failed:', error);
    return json({ state, notams: [] as Notam[], error: (error as Error).message });
  }

  const base: Notam[] = list
    .filter((t) => t.state === state && t.notam_id)
    .map((t) => ({
      id: t.notam_id as string,
      type: t.type ?? 'TFR',
      description: t.description ?? '',
      link: tfrLink(t.notam_id as string)
    }));

  const notams = await Promise.all(
    base.map(async (n, i) => {
      if (i >= MAX_DETAIL) return n;
      try {
        const detail = await cached(`notam-detail:${n.id}`, DETAIL_TTL_MS, () =>
          fetchTfrDetail(n.id)
        );
        return { ...n, ...detail };
      } catch (error) {
        console.error(`TFR detail ${n.id} fetch failed:`, error);
        return n;
      }
    })
  );

  return etagJson(request, { state, notams });
};
