import type { AirspaceZone } from '$lib/safety';

// Keyless national UAS-geo-zone feeds for the European states this station
// covers. Each returns GeoJSON for a bounding box with no API key, so an
// operator without an OpenAIP key still sees the official drone restrictions in
// Germany, Switzerland, and France (the FAA layers are US only). Every adapter
// emits the shared AirspaceZone contract, tagged regime 'eu', so validateMission
// and the map treat them like any other airspace. Bounding boxes are
// minLon,minLat,maxLon,maxLat; coverage boxes are [west, south, east, north].

export interface RegionalSource {
  id: string;
  name: string;
  attribution: string;
  coverage: [number, number, number, number];
  fetch(bbox: string): Promise<AirspaceZone[]>;
}

const FT_TO_M = 0.3048;

function bounds(bbox: string): [number, number, number, number] | null {
  const parts = bbox.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  return parts as [number, number, number, number];
}

export function bboxIntersectsCoverage(
  coverage: [number, number, number, number],
  bbox: string
): boolean {
  const b = bounds(bbox);
  if (!b) return false;
  const [w, s, e, n] = coverage;
  const [minLon, minLat, maxLon, maxLat] = b;
  return !(maxLon < w || minLon > e || maxLat < s || minLat > n);
}

export function bboxWithinCoverage(
  coverage: [number, number, number, number],
  bbox: string
): boolean {
  const b = bounds(bbox);
  if (!b) return false;
  const [w, s, e, n] = coverage;
  const [minLon, minLat, maxLon, maxLat] = b;
  return minLon >= w && maxLon <= e && minLat >= s && maxLat <= n;
}

// A GeoJSON Polygon maps to one zone; a MultiPolygon maps to one zone per
// polygon so the point-in-polygon check stays a simple ring test.
function toZones(
  geometry: { type?: string; coordinates?: unknown } | null | undefined,
  base: Omit<AirspaceZone, 'polygon'>
): AirspaceZone[] {
  if (!geometry || !geometry.coordinates) return [];
  if (geometry.type === 'Polygon') {
    return [{ ...base, polygon: geometry.coordinates as number[][][] }];
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][]).map((polygon) => ({ ...base, polygon }));
  }
  return [];
}

function metersFrom(value: unknown, unit: unknown): number | undefined {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (Number.isNaN(n)) return undefined;
  return /ft/i.test(String(unit)) ? n * FT_TO_M : n;
}

function altitudeLabel(value: unknown, unit: unknown, ref: unknown): string | undefined {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (Number.isNaN(n)) return undefined;
  if (n === 0) return 'Surface';
  const u = String(unit || 'm');
  const r = /msl|amsl/i.test(String(ref)) ? ' MSL' : /agl|gnd/i.test(String(ref)) ? ' AGL' : '';
  return `${n} ${u}${r}`;
}

interface FeatureCollection {
  features?: { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } | null }[];
}

async function wfsGeoJson(base: string, typeName: string, bbox: string, crs: string): Promise<FeatureCollection> {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: typeName,
    outputFormat: 'application/json',
    srsName: crs,
    bbox: `${bbox},${crs}`,
    count: '200'
  });
  const res = await fetch(`${base}?${params}`);
  if (!res.ok) throw new Error(`${typeName} responded ${res.status}`);
  return res.json();
}

// Germany: DIPUL publishes one layer per geo-zone category. Aerodromes, control
// zones, flight-restriction and temporary-restriction areas, hospitals, and
// prisons are hard no-fly; nature reserves, industrial sites, power stations,
// motorways, railways, and waterways are advisory.
const CRS84 = 'urn:ogc:def:crs:OGC:1.3:CRS84';
const DIPUL_BASE = 'https://uas-betrieb.de/geoservices/dipul/ows';
const DIPUL_LAYERS: { layer: string; label: string; restricted: boolean }[] = [
  { layer: 'flughaefen', label: 'Airport', restricted: true },
  { layer: 'flugplaetze', label: 'Airfield', restricted: true },
  { layer: 'kontrollzonen', label: 'Control zone', restricted: true },
  { layer: 'flugbeschraenkungsgebiete', label: 'Flight restriction area', restricted: true },
  { layer: 'temporaere_betriebseinschraenkungen', label: 'Temporary restriction', restricted: true },
  { layer: 'krankenhaeuser', label: 'Hospital', restricted: true },
  { layer: 'justizvollzugsanstalten', label: 'Correctional facility', restricted: true },
  { layer: 'naturschutzgebiete', label: 'Nature reserve', restricted: false },
  { layer: 'industrieanlagen', label: 'Industrial site', restricted: false },
  { layer: 'kraftwerke', label: 'Power station', restricted: false },
  { layer: 'bundesautobahnen', label: 'Motorway', restricted: false },
  { layer: 'bahnanlagen', label: 'Railway', restricted: false },
  { layer: 'binnenwasserstrassen', label: 'Inland waterway', restricted: false },
  { layer: 'seewasserstrassen', label: 'Sea waterway', restricted: false }
];

async function fetchDipulLayer(bbox: string, entry: (typeof DIPUL_LAYERS)[number]): Promise<AirspaceZone[]> {
  const data = await wfsGeoJson(DIPUL_BASE, `dipul:${entry.layer}`, bbox, CRS84);
  const features = Array.isArray(data.features) ? data.features : [];
  return features.flatMap((f) => {
    const p = f.properties ?? {};
    const lower = altitudeLabel(p.lower_limit_altitude, p.lower_limit_unit, p.lower_limit_alt_ref);
    const upper = altitudeLabel(p.upper_limit_altitude, p.upper_limit_unit, p.upper_limit_alt_ref);
    return toZones(f.geometry, {
      name: String(p.generated_name_EN || p.name || entry.label),
      restricted: entry.restricted,
      type: entry.label,
      regime: 'eu',
      lower,
      upper,
      lowerM: metersFrom(p.lower_limit_altitude, p.lower_limit_unit) ?? 0,
      upperM: metersFrom(p.upper_limit_altitude, p.upper_limit_unit)
    });
  });
}

async function fetchDipul(bbox: string): Promise<AirspaceZone[]> {
  const results = await Promise.allSettled(DIPUL_LAYERS.map((entry) => fetchDipulLayer(bbox, entry)));
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

// Switzerland: BAZL exposes drone restrictions through the geo.admin identify
// endpoint. Zones require authorization or are prohibited, so all are treated as
// no-fly for planning; the whole polygon blocks (no reliable altitude floor).
const BAZL_BASE = 'https://api3.geo.admin.ch/rest/services/api/MapServer/identify';

async function fetchBazl(bbox: string): Promise<AirspaceZone[]> {
  const b = bounds(bbox);
  if (!b) return [];
  const params = new URLSearchParams({
    geometryType: 'esriGeometryEnvelope',
    geometry: bbox,
    geometryFormat: 'geojson',
    layers: 'all:ch.bazl.einschraenkungen-drohnen',
    sr: '4326',
    tolerance: '0',
    mapExtent: bbox,
    imageDisplay: '500,500,96',
    returnGeometry: 'true'
  });
  const res = await fetch(`${BAZL_BASE}?${params}`);
  if (!res.ok) throw new Error(`BAZL responded ${res.status}`);
  const data = await res.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.flatMap((r: { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> }) => {
    const p = r.properties ?? {};
    const restrictionId = String(p.zone_restriction_id ?? '');
    const restricted = /PROHIB|REQ_AUTHORISATION|NO_DRONE/i.test(restrictionId) || restrictionId === '';
    const lower = altitudeLabel(p.air_vol_lower_limit, 'm', p.air_vol_lower_vref);
    const upper = altitudeLabel(p.air_vol_upper_limit, 'm', p.air_vol_upper_vref);
    return toZones(r.geometry, {
      name: String(p.zone_name_en || p.zone_name_de || 'Drone restriction zone'),
      restricted,
      type: 'UAS geographical zone',
      regime: 'eu',
      lower,
      upper,
      lowerM: 0
    });
  });
}

// France: IGN publishes one restriction layer. "Vol interdit" marks a no-fly
// zone; other entries carry an advisory limit in the remark.
const IGN_BASE = 'https://data.geopf.fr/wfs/ows';
const IGN_LAYER = 'TRANSPORTS.DRONES.RESTRICTIONS:carte_restriction_drones_lf';
const IGN_CRS = 'CRS:84';

async function fetchIgn(bbox: string): Promise<AirspaceZone[]> {
  const data = await wfsGeoJson(IGN_BASE, IGN_LAYER, bbox, IGN_CRS);
  const features = Array.isArray(data.features) ? data.features : [];
  return features.flatMap((f) => {
    const p = f.properties ?? {};
    const limite = String(p.limite ?? '');
    const remarque = String(p.remarque ?? '');
    const restricted = /interdit/i.test(limite);
    return toZones(f.geometry, {
      name: remarque || limite || 'Drone restriction zone',
      restricted,
      type: 'UAS geographical zone',
      regime: 'eu',
      lower: limite || undefined,
      lowerM: 0
    });
  });
}

export const REGIONAL_SOURCES: RegionalSource[] = [
  {
    id: 'dipul',
    name: 'DIPUL (Germany)',
    attribution: 'dipul',
    coverage: [5.5, 47.2, 15.5, 55.1],
    fetch: fetchDipul
  },
  {
    id: 'bazl',
    name: 'BAZL (Switzerland)',
    attribution: 'BAZL / geo.admin.ch',
    coverage: [5.9, 45.8, 10.6, 47.9],
    fetch: fetchBazl
  },
  {
    id: 'ign',
    name: 'IGN (France)',
    attribution: 'IGN / Geoportail',
    coverage: [-5.5, 41.2, 9.7, 51.2],
    fetch: fetchIgn
  }
];

export function regionalSourcesForBbox(bbox: string): RegionalSource[] {
  return REGIONAL_SOURCES.filter((s) => bboxIntersectsCoverage(s.coverage, bbox));
}
