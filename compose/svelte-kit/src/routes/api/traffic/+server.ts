import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { cached, bboxKey } from '$lib/server/geocache';

const TRAFFIC_TTL_MS = 5_000;
const FEED_TIMEOUT_MS = 4_000;
const MIN_RADIUS_NM = 5;
const MAX_RADIUS_NM = 250;
const NM_PER_DEG_LAT = 60;
const KT_TO_MPS = 0.514444;
const FT_TO_M = 0.3048;

interface FeedAircraft {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  gs?: number;
  track?: number;
}

// Keyless community ADS-B feeds, queried by point and radius in nautical miles.
const FEEDS = [
  (lat: number, lon: number, r: number) => `https://api.adsb.lol/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${r}`,
  (lat: number, lon: number, r: number) => `https://opendata.adsb.fi/api/v2/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${r}`
];

export const GET: RequestHandler = async ({ url }) => {
  const bbox = url.searchParams.get('bbox');
  if (!bbox) return json({ contacts: [] });
  const [west, south, east, north] = bbox.split(',').map(Number);
  if ([west, south, east, north].some((n) => !Number.isFinite(n))) return json({ contacts: [] });

  const lat = (south + north) / 2;
  const lon = (west + east) / 2;
  const halfLatNm = ((north - south) / 2) * NM_PER_DEG_LAT;
  const halfLonNm = ((east - west) / 2) * NM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  const radius = Math.round(Math.min(MAX_RADIUS_NM, Math.max(MIN_RADIUS_NM, Math.hypot(halfLatNm, halfLonNm))));

  const contacts = await cached(bboxKey('traffic', bbox), TRAFFIC_TTL_MS, async () => {
    for (const feed of FEEDS) {
      try {
        const res = await fetch(feed(lat, lon, radius), {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(FEED_TIMEOUT_MS)
        });
        if (!res.ok) continue;
        const data = await res.json();
        const list: FeedAircraft[] = data.ac ?? data.aircraft ?? [];
        return list
          .filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number' && a.hex)
          .map((a) => ({
            id: `net-${a.hex}`,
            callsign: (a.flight ?? '').trim() || String(a.hex).toUpperCase(),
            lat: a.lat as number,
            lon: a.lon as number,
            altM: typeof a.alt_baro === 'number' ? a.alt_baro * FT_TO_M : null,
            headingDeg: typeof a.track === 'number' ? a.track : null,
            speedMps: typeof a.gs === 'number' ? a.gs * KT_TO_MPS : null
          }));
      } catch {
        // try the next feed
      }
    }
    return [];
  });
  return json({ contacts });
};
