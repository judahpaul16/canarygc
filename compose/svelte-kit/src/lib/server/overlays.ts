import type { AirspaceZone } from '$lib/safety';
import type { Building, CeilingCell, Obstacle } from '$lib/hazards';
import { getSetting } from './settings';
import { cached, bboxKey } from './geocache';

// Airspace, FAA hazard, and OSM building lookups shared by the overlay API
// routes and the server-side flows that plan with no browser attached. Every
// bounding box is minLon,minLat,maxLon,maxLat.

const AIRSPACE_TTL_MS = 10 * 60 * 1000;
const HAZARDS_TTL_MS = 10 * 60 * 1000;
const BUILDINGS_TTL_MS = 60 * 60 * 1000; // buildings change slowly

const OPENAIP_URL = 'https://api.core.openaip.net/api/airspaces';
const RESTRICTED_KEYWORDS = ['PROHIBITED', 'RESTRICTED', 'DANGER', 'NO_FLY', 'NOFLY', 'TRA', 'TSA'];

const FAA_BASE = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services';

interface FaaProps {
  NAME?: string;
  TYPE_CODE?: string;
  LOWER_VAL?: number;
  LOWER_UOM?: string;
  LOWER_CODE?: string;
  UPPER_VAL?: number;
  UPPER_UOM?: string;
  UPPER_CODE?: string;
}

// FAA altitude comes as value + unit + reference code. A negative value is a
// sentinel for an unspecified limit (the airspace extends up to the overlying
// airspace), which reads as no ceiling rather than a number.
function formatAltitude(val?: number, uom?: string, code?: string): string | undefined {
  if (val === undefined || val === null || val < 0) return undefined;
  if (val === 0) return 'Surface';
  const measure = !uom || uom === 'FT' ? `${Math.round(val).toLocaleString()} ft` : `${val} ${uom}`;
  const reference = code === 'MSL' ? ' MSL' : code === 'AGL' ? ' AGL' : '';
  return `${measure}${reference}`;
}

const FT_TO_M = 0.3048;

// The numeric limit in meters for altitude comparisons. Flight levels come in
// hundreds of feet; a negative value is the unspecified-limit sentinel.
function altitudeMeters(val?: number, uom?: string): number | undefined {
  if (val === undefined || val === null || val < 0) return undefined;
  const feet = uom === 'FL' ? val * 100 : val;
  return feet * FT_TO_M;
}

const SUA_TYPE_NAMES: Record<string, string> = {
  P: 'Prohibited area',
  R: 'Restricted area',
  W: 'Warning area',
  A: 'Alert area',
  MOA: 'Military Operations Area',
  NSA: 'National Security Area'
};

function classFromName(name: string): string | undefined {
  const match = /CLASS\s+([A-G])/i.exec(name);
  return match ? `Class ${match[1].toUpperCase()}` : undefined;
}

// Prohibited and Restricted areas are hard no-fly; MOAs, warning and alert
// areas, and class airspace are advisory (they warn, they do not block).
const FAA_LAYERS: {
  service: string;
  outFields: string;
  restricted: (props: FaaProps) => boolean;
  type: (props: FaaProps) => string | undefined;
}[] = [
  {
    service: 'Prohibited_Areas',
    outFields: 'NAME,LOWER_VAL,LOWER_UOM,LOWER_CODE,UPPER_VAL,UPPER_UOM,UPPER_CODE',
    restricted: () => true,
    type: () => 'Prohibited area'
  },
  {
    service: 'Special_Use_Airspace',
    outFields: 'NAME,TYPE_CODE,LOWER_VAL,LOWER_UOM,LOWER_CODE,UPPER_VAL,UPPER_UOM,UPPER_CODE',
    restricted: (p) => p.TYPE_CODE === 'P' || p.TYPE_CODE === 'R',
    type: (p) => (p.TYPE_CODE ? SUA_TYPE_NAMES[p.TYPE_CODE] ?? p.TYPE_CODE : undefined)
  },
  {
    service: 'Class_Airspace',
    outFields: 'NAME,LOWER_VAL,LOWER_UOM,LOWER_CODE,UPPER_VAL,UPPER_UOM,UPPER_CODE',
    restricted: () => false,
    type: (p) => classFromName(p.NAME ?? '')
  }
];

interface GeoFeature {
  properties?: Record<string, unknown>;
  geometry?: { type?: string; coordinates?: unknown } | null;
}

function isRestricted(feature: { name?: string; type?: number | string; icaoClass?: number | string }): boolean {
  const label = `${feature.type ?? ''} ${feature.icaoClass ?? ''} ${feature.name ?? ''}`.toUpperCase();
  return RESTRICTED_KEYWORDS.some((kw) => label.includes(kw));
}

// A GeoJSON Polygon maps to one zone; a MultiPolygon maps to one zone per
// polygon so the point-in-polygon check stays a simple ring test.
function polygonZones(feature: GeoFeature, base: Omit<AirspaceZone, 'polygon'>): AirspaceZone[] {
  const g = feature.geometry;
  if (!g || !g.coordinates) return [];
  if (g.type === 'Polygon') return [{ ...base, polygon: g.coordinates as number[][][] }];
  if (g.type === 'MultiPolygon') {
    return (g.coordinates as number[][][][]).map((polygon) => ({ ...base, polygon }));
  }
  return [];
}

async function fetchOpenAip(bbox: string, apiKey: string): Promise<AirspaceZone[]> {
  const query = new URLSearchParams({ bbox, limit: '500' });
  const response = await fetch(`${OPENAIP_URL}?${query}`, {
    headers: { 'x-openaip-api-key': apiKey }
  });
  if (!response.ok) throw new Error(`OpenAIP responded ${response.status}`);
  const data = await response.json();
  const features = Array.isArray(data?.items) ? data.items : [];
  return features
    .filter(
      (f: { geometry?: { type?: string; coordinates?: unknown } }) =>
        f.geometry?.type === 'Polygon' && Array.isArray(f.geometry.coordinates)
    )
    .map((f: { name?: string; type?: number; icaoClass?: number; geometry: { coordinates: number[][][] } }) => ({
      name: f.name ?? 'Airspace',
      restricted: isRestricted(f),
      polygon: f.geometry.coordinates
    }));
}

async function fetchFaaLayer(bbox: string, layer: (typeof FAA_LAYERS)[number]): Promise<AirspaceZone[]> {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: bbox,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: layer.outFields,
    returnGeometry: 'true',
    geometryPrecision: '5',
    resultRecordCount: '200',
    f: 'geojson'
  });
  const res = await fetch(`${FAA_BASE}/${layer.service}/FeatureServer/0/query?${params}`);
  if (!res.ok) throw new Error(`FAA ${layer.service} responded ${res.status}`);
  const data = await res.json();
  const features: GeoFeature[] = Array.isArray(data?.features) ? data.features : [];
  return features.flatMap((f) => {
    const props = (f.properties ?? {}) as FaaProps;
    return polygonZones(f, {
      name: props.NAME || 'Airspace',
      restricted: layer.restricted(props),
      type: layer.type(props),
      lower: formatAltitude(props.LOWER_VAL, props.LOWER_UOM, props.LOWER_CODE),
      upper: formatAltitude(props.UPPER_VAL, props.UPPER_UOM, props.UPPER_CODE),
      lowerM: altitudeMeters(props.LOWER_VAL, props.LOWER_UOM),
      upperM: altitudeMeters(props.UPPER_VAL, props.UPPER_UOM)
    });
  });
}

async function fetchFaa(bbox: string): Promise<AirspaceZone[]> {
  const results = await Promise.allSettled(FAA_LAYERS.map((layer) => fetchFaaLayer(bbox, layer)));
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

export interface AirspaceResult {
  zones: AirspaceZone[];
  source: 'openaip' | 'faa' | 'none';
  configured: boolean;
  error?: string;
}

// OpenAIP when a key is configured, falling back to the FAA's keyless public
// layers when the key is unset or OpenAIP returns nothing.
export async function airspaceForBbox(bbox: string): Promise<AirspaceResult> {
  const apiKey = (await getSetting('integration.openaip')) || process.env.OPENAIP_API_KEY;

  if (apiKey) {
    try {
      const zones = await cached(bboxKey('airspace-openaip', bbox), AIRSPACE_TTL_MS, () =>
        fetchOpenAip(bbox, apiKey)
      );
      if (zones.length > 0) return { zones, source: 'openaip', configured: true };
    } catch (error) {
      console.error('OpenAIP fetch failed:', error);
    }
  }

  try {
    const zones = await cached(bboxKey('airspace-faa', bbox), AIRSPACE_TTL_MS, () => fetchFaa(bbox));
    return { zones, source: 'faa', configured: Boolean(apiKey) };
  } catch (error) {
    console.error('FAA airspace fetch failed:', error);
    return { zones: [], source: 'none', configured: Boolean(apiKey), error: (error as Error).message };
  }
}

async function fetchCeilings(bbox: string): Promise<CeilingCell[]> {
  const params = hazardQueryParams(bbox, 'CEILING,UNIT,APT1_NAME,APT1_LAANC');
  params.set('geometryPrecision', '5');
  params.set('resultRecordCount', '1500');
  const res = await fetch(`${FAA_BASE}/FAA_UAS_FacilityMap_Data/FeatureServer/0/query?${params}`);
  if (!res.ok) throw new Error(`FAA UASFM responded ${res.status}`);
  const data = await res.json();
  const features: GeoFeature[] = Array.isArray(data?.features) ? data.features : [];
  const cells: CeilingCell[] = [];
  for (const f of features) {
    const p = (f.properties ?? {}) as { CEILING?: number; APT1_NAME?: string; APT1_LAANC?: number };
    const g = f.geometry;
    if (!g?.coordinates || typeof p.CEILING !== 'number') continue;
    const polygons =
      g.type === 'Polygon'
        ? [g.coordinates as number[][][]]
        : g.type === 'MultiPolygon'
          ? (g.coordinates as number[][][][])
          : [];
    for (const polygon of polygons) {
      cells.push({
        ceilingFt: p.CEILING,
        airport: (p.APT1_NAME ?? '').trim(),
        laanc: p.APT1_LAANC === 1,
        polygon
      });
    }
  }
  return cells;
}

const OBSTACLE_LIMIT = 500;

function hazardQueryParams(bbox: string, outFields: string): URLSearchParams {
  return new URLSearchParams({
    where: '1=1',
    geometry: bbox,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields,
    returnGeometry: 'true',
    f: 'geojson'
  });
}

async function fetchObstacles(bbox: string): Promise<{ obstacles: Obstacle[]; truncated: boolean }> {
  const params = hazardQueryParams(bbox, 'Type_Code,AGL,AMSL');
  // The tallest obstacles matter most when the area holds more than the cap.
  params.set('orderByFields', 'AGL DESC');
  params.set('resultRecordCount', String(OBSTACLE_LIMIT));
  const res = await fetch(`${FAA_BASE}/Digital_Obstacle_File/FeatureServer/0/query?${params}`);
  if (!res.ok) throw new Error(`FAA DOF responded ${res.status}`);
  const data = await res.json();
  const features: GeoFeature[] = Array.isArray(data?.features) ? data.features : [];
  const obstacles: Obstacle[] = [];
  for (const f of features) {
    const p = (f.properties ?? {}) as { Type_Code?: string; AGL?: number; AMSL?: number };
    const g = f.geometry;
    if (g?.type !== 'Point' || !Array.isArray(g.coordinates)) continue;
    const [lon, lat] = g.coordinates as number[];
    obstacles.push({
      lat,
      lon,
      type: (p.Type_Code ?? 'OBSTACLE').trim(),
      aglFt: p.AGL ?? 0,
      amslFt: p.AMSL ?? 0
    });
  }
  return { obstacles, truncated: data?.properties?.exceededTransferLimit === true };
}

export interface HazardsResult {
  ceilings: CeilingCell[];
  obstacles: Obstacle[];
  obstaclesTruncated: boolean;
}

// The FAA's keyless public layers (US): the UAS Facility Map LAANC ceiling grid
// and the Digital Obstacle File.
export async function hazardsForBbox(bbox: string): Promise<HazardsResult> {
  const [ceilings, obstacleResult] = await Promise.allSettled([
    cached(bboxKey('ceilings', bbox), HAZARDS_TTL_MS, () => fetchCeilings(bbox)),
    cached(bboxKey('obstacles', bbox), HAZARDS_TTL_MS, () => fetchObstacles(bbox))
  ]);
  if (ceilings.status === 'rejected') console.error('FAA UASFM fetch failed:', ceilings.reason);
  if (obstacleResult.status === 'rejected') console.error('FAA DOF fetch failed:', obstacleResult.reason);

  return {
    ceilings: ceilings.status === 'fulfilled' ? ceilings.value : [],
    obstacles: obstacleResult.status === 'fulfilled' ? obstacleResult.value.obstacles : [],
    obstaclesTruncated: obstacleResult.status === 'fulfilled' ? obstacleResult.value.truncated : false
  };
}

// Building footprints and heights for path planning, from OpenStreetMap via the
// Overpass API. The FAA obstacle file only lists registered tall structures
// (towers, stacks), so ordinary buildings come from OSM. Overpass wants
// south,west,north,east.

// The public Overpass instances rate-limit and go down; try mirrors in order so
// a single busy instance does not blank out the buildings.
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
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

export async function buildingsForBbox(bbox: string): Promise<Building[]> {
  return cached(bboxKey('buildings', bbox), BUILDINGS_TTL_MS, () => fetchBuildings(bbox));
}
