// Pure geospatial helpers shared by the mission planner, safety checks, and
// map overlays. No Leaflet or DOM dependency so they run on the server too.

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_M = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;

// Great-circle distance in meters between two coordinates.
export function haversineMeters(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLon = (b.lon - a.lon) * DEG_TO_RAD;
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// Initial bearing in degrees (0-360) from a to b.
export function bearingDegrees(a: LatLon, b: LatLon): number {
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const dLon = (b.lon - a.lon) * DEG_TO_RAD;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) / DEG_TO_RAD + 360) % 360;
}

// Total path length in meters for an ordered list of points.
export function pathLengthMeters(points: LatLon[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineMeters(points[i], points[i + 1]);
  }
  return total;
}

// Ray-casting point-in-polygon. Ring is a list of [lon, lat] pairs (GeoJSON
// order). Works for the small convex/concave airspace polygons we test against.
export function pointInRing(point: LatLon, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// A GeoJSON Polygon has an outer ring plus optional holes; a point counts as
// inside when it is in the outer ring and outside every hole.
export function pointInPolygon(point: LatLon, polygon: number[][][]): boolean {
  if (polygon.length === 0) return false;
  if (!pointInRing(point, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h++) {
    if (pointInRing(point, polygon[h])) return false;
  }
  return true;
}
