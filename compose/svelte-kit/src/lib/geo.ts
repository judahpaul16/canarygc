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

// Destination coordinate a great-circle distance and initial bearing away.
export function destinationPoint(origin: LatLon, bearingDeg: number, distanceM: number): LatLon {
  const angular = distanceM / EARTH_RADIUS_M;
  const bearing = bearingDeg * DEG_TO_RAD;
  const lat1 = origin.lat * DEG_TO_RAD;
  const lon1 = origin.lon * DEG_TO_RAD;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { lat: lat2 / DEG_TO_RAD, lon: ((lon2 / DEG_TO_RAD + 540) % 360) - 180 };
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

// Coordinates are treated as planar (x = lon, y = lat), which is accurate over
// the local scale of a single mission leg.
function cross(a: LatLon, b: LatLon, c: LatLon): number {
  return (b.lon - a.lon) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lon - a.lon);
}

function onSegment(a: LatLon, b: LatLon, c: LatLon): boolean {
  return (
    Math.min(a.lon, b.lon) <= c.lon &&
    c.lon <= Math.max(a.lon, b.lon) &&
    Math.min(a.lat, b.lat) <= c.lat &&
    c.lat <= Math.max(a.lat, b.lat)
  );
}

// True when segment a-b crosses segment c-d, including collinear overlap.
export function segmentsIntersect(a: LatLon, b: LatLon, c: LatLon, d: LatLon): boolean {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0) return true;
  if (d1 === 0 && onSegment(a, b, c)) return true;
  if (d2 === 0 && onSegment(a, b, d)) return true;
  if (d3 === 0 && onSegment(c, d, a)) return true;
  if (d4 === 0 && onSegment(c, d, b)) return true;
  return false;
}

// Projection of a point onto the segment a-b on a local equirectangular
// plane, accurate at mission-leg scale: the along-track fraction (0 at a,
// 1 at b, clamped) and the offset distance in meters.
export function segmentProjection(p: LatLon, a: LatLon, b: LatLon): { t: number; distanceM: number } {
  const metersPerDegLat = (Math.PI / 180) * EARTH_RADIUS_M;
  const metersPerDegLon = metersPerDegLat * Math.cos(p.lat * DEG_TO_RAD);
  const ax = (a.lon - p.lon) * metersPerDegLon;
  const ay = (a.lat - p.lat) * metersPerDegLat;
  const bx = (b.lon - p.lon) * metersPerDegLon;
  const by = (b.lat - p.lat) * metersPerDegLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return { t, distanceM: Math.sqrt(cx * cx + cy * cy) };
}

// Shortest distance in meters from a point to the segment a-b.
export function pointToSegmentMeters(p: LatLon, a: LatLon, b: LatLon): number {
  return segmentProjection(p, a, b).distanceM;
}

// Evenly spaced points along the segment a-b, endpoints included.
export function pointsAlong(a: LatLon, b: LatLon, count: number): LatLon[] {
  const points: LatLon[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    points.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
  }
  return points;
}

// True when the leg a-b enters a GeoJSON polygon: either endpoint inside, or the
// leg crossing the outer ring.
export function segmentIntersectsPolygon(a: LatLon, b: LatLon, polygon: number[][][]): boolean {
  if (polygon.length === 0) return false;
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return true;
  const outer = polygon[0];
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const c: LatLon = { lon: outer[j][0], lat: outer[j][1] };
    const d: LatLon = { lon: outer[i][0], lat: outer[i][1] };
    if (segmentsIntersect(a, b, c, d)) return true;
  }
  return false;
}
