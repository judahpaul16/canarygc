import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import type { CeilingCell, Obstacle } from '$lib/hazards';

// Flight hazards for the map overlays and safety checks, from the FAA's keyless
// public layers (US): the UAS Facility Map LAANC ceiling grid and the Digital
// Obstacle File. The bounding box is minLon,minLat,maxLon,maxLat.

const FAA_BASE = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services';
const OBSTACLE_LIMIT = 500;

interface GeoFeature {
  properties?: Record<string, unknown>;
  geometry?: { type?: string; coordinates?: unknown } | null;
}

function queryParams(bbox: string, outFields: string): URLSearchParams {
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

async function fetchCeilings(bbox: string): Promise<CeilingCell[]> {
  const params = queryParams(bbox, 'CEILING,UNIT,APT1_NAME,APT1_LAANC');
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

async function fetchObstacles(bbox: string): Promise<{ obstacles: Obstacle[]; truncated: boolean }> {
  const params = queryParams(bbox, 'Type_Code,AGL,AMSL');
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

export const GET: RequestHandler = async ({ url }) => {
  const bbox = url.searchParams.get('bbox');
  if (!bbox) {
    return json({ ceilings: [] as CeilingCell[], obstacles: [] as Obstacle[], obstaclesTruncated: false });
  }

  const [ceilings, obstacleResult] = await Promise.allSettled([fetchCeilings(bbox), fetchObstacles(bbox)]);
  if (ceilings.status === 'rejected') console.error('FAA UASFM fetch failed:', ceilings.reason);
  if (obstacleResult.status === 'rejected') console.error('FAA DOF fetch failed:', obstacleResult.reason);

  return json({
    ceilings: ceilings.status === 'fulfilled' ? ceilings.value : [],
    obstacles: obstacleResult.status === 'fulfilled' ? obstacleResult.value.obstacles : [],
    obstaclesTruncated: obstacleResult.status === 'fulfilled' ? obstacleResult.value.truncated : false
  });
};
