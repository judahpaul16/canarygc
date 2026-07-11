import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import type { Building } from '$lib/hazards';
import { cached, bboxKey } from '$lib/server/geocache';

// Building footprints and heights for path planning, from OpenStreetMap via the
// Overpass API. The FAA obstacle file only lists registered tall structures
// (towers, stacks), so ordinary buildings come from OSM. The bounding box is
// minLon,minLat,maxLon,maxLat; Overpass wants south,west,north,east.

// The public Overpass instances rate-limit and go down; try mirrors in order so
// a single busy instance does not blank out the buildings.
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
const BUILDINGS_TTL_MS = 60 * 60 * 1000; // buildings change slowly
const METERS_PER_LEVEL = 3;
// A conservative low-rise height for buildings that carry no height tag, so they
// still register against a low-altitude leg.
const DEFAULT_BUILDING_HEIGHT_M = 8;
const MAX_BUILDINGS = 3000;

interface OverpassNode {
  lat: number;
  lon: number;
}
interface OverpassWay {
  type: string;
  geometry?: OverpassNode[];
  tags?: Record<string, string>;
}

function parseHeight(tags: Record<string, string> | undefined): number {
  const height = tags?.height ?? tags?.['building:height'];
  if (height) {
    const n = parseFloat(height);
    if (!isNaN(n) && n > 0) return n;
  }
  const levels = tags?.['building:levels'];
  if (levels) {
    const n = parseFloat(levels);
    if (!isNaN(n) && n > 0) return n * METERS_PER_LEVEL;
  }
  return DEFAULT_BUILDING_HEIGHT_M;
}

async function fetchBuildings(bbox: string): Promise<Building[]> {
  const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(Number);
  if ([minLon, minLat, maxLon, maxLat].some((n) => Number.isNaN(n))) return [];
  const query =
    `[out:json][timeout:25];way["building"](${minLat},${minLon},${maxLat},${maxLon});out geom ${MAX_BUILDINGS};`;
  const body = `data=${encodeURIComponent(query)}`;

  let elements: OverpassWay[] = [];
  let lastError: Error | null = null;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        // Overpass etiquette requires a meaningful User-Agent; mirrors reject
        // requests without one.
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'CanaryGC Ground Control Station',
          Accept: 'application/json'
        },
        body
      });
      if (!res.ok) {
        lastError = new Error(`${url} responded ${res.status}`);
        continue;
      }
      const data = await res.json();
      // A rate-limited or timed-out instance answers 200 with a remark and no
      // data; treat that as a miss and try the next mirror.
      if (data?.remark && (!data.elements || data.elements.length === 0)) {
        lastError = new Error(`${url}: ${data.remark}`);
        continue;
      }
      elements = Array.isArray(data?.elements) ? data.elements : [];
      lastError = null;
      break;
    } catch (error) {
      lastError = error as Error;
    }
  }
  if (lastError) throw lastError;

  const buildings: Building[] = [];
  for (const el of elements) {
    if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 3) continue;
    const ring = el.geometry.map((n) => [n.lon, n.lat]);
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
    buildings.push({ polygon: [ring], heightM: parseHeight(el.tags) });
  }
  return buildings;
}

export const GET: RequestHandler = async ({ url }) => {
  const bbox = url.searchParams.get('bbox');
  if (!bbox) return json({ buildings: [] as Building[] });

  try {
    const buildings = await cached(bboxKey('buildings', bbox), BUILDINGS_TTL_MS, () => fetchBuildings(bbox));
    return json({ buildings });
  } catch (error) {
    console.error('Overpass buildings fetch failed:', error);
    return json({ buildings: [] as Building[], error: (error as Error).message });
  }
};
