import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import type { AirspaceZone } from '$lib/safety';
import { getSetting } from '$lib/server/settings';

// Airspace for the map overlay and safety checks. OpenAIP is worldwide but
// needs a key; when the key is unset or OpenAIP returns nothing, this falls back
// to the FAA's public airspace layers, which are keyless and cover the US. The
// bounding box is minLon,minLat,maxLon,maxLat, which serves both providers.

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
      upper: formatAltitude(props.UPPER_VAL, props.UPPER_UOM, props.UPPER_CODE)
    });
  });
}

async function fetchFaa(bbox: string): Promise<AirspaceZone[]> {
  const results = await Promise.allSettled(FAA_LAYERS.map((layer) => fetchFaaLayer(bbox, layer)));
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

export const GET: RequestHandler = async ({ url }) => {
  const apiKey = (await getSetting('integration.openaip')) || process.env.OPENAIP_API_KEY;
  const bbox = url.searchParams.get('bbox');

  if (!bbox) {
    return json({ zones: [] as AirspaceZone[], source: 'none', configured: Boolean(apiKey) });
  }

  if (apiKey) {
    try {
      const zones = await fetchOpenAip(bbox, apiKey);
      if (zones.length > 0) return json({ zones, source: 'openaip', configured: true });
    } catch (error) {
      console.error('OpenAIP fetch failed:', error);
    }
  }

  try {
    const zones = await fetchFaa(bbox);
    return json({ zones, source: 'faa', configured: Boolean(apiKey) });
  } catch (error) {
    console.error('FAA airspace fetch failed:', error);
    return json({
      zones: [] as AirspaceZone[],
      source: 'none',
      configured: Boolean(apiKey),
      error: (error as Error).message
    });
  }
};
