import {
  bearingDegrees,
  destinationPoint,
  pointInPolygon,
  pointsAlong,
  segmentIntersectsPolygon,
  segmentProjection,
  type LatLon
} from './geo';
import { feetToMeters, type Building, type Obstacle } from './hazards';
import type { AirspaceZone } from './safety';

export const APPROACH_DISTANCE_M = 800;
export const APPROACH_ALT_M = 60;
// Horizontal meters flown per meter of descent on final, a shallow glide both
// autopilots accept.
const GLIDE_RATIO = 12;
const CORRIDOR_HALF_WIDTH_M = 60;
const HAZARD_CLEARANCE_M = 10;
const TERRAIN_CLEARANCE_M = 20;
const TERRAIN_SAMPLES = 8;
// Candidate approach directions, in order of preference: straight from the
// vehicle's side first, then swinging around the launch point.
const BEARING_OFFSETS = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180];

export interface ApproachPick {
  approach: LatLon;
  altM: number;
  distanceM: number;
  bearingDeg: number;
  // False when every corridor is blocked and the default geometry returns.
  clear: boolean;
  warnings: string[];
}

// Terrain elevations in meters for the points, in order; null when the source
// is unavailable, in which case terrain goes unchecked and a warning says so.
export type ElevationSampler = (points: LatLon[]) => Promise<number[] | null>;

interface HazardCircle {
  center: LatLon;
  radiusM: number;
  topM: number;
}

function hazardCircles(obstacles: Obstacle[], buildings: Building[]): HazardCircle[] {
  const circles: HazardCircle[] = obstacles.map((o) => ({
    center: { lat: o.lat, lon: o.lon },
    radiusM: 0,
    topM: feetToMeters(o.aglFt)
  }));
  for (const b of buildings) {
    const ring = b.polygon?.[0];
    if (!ring || ring.length < 3) continue;
    let lat = 0;
    let lon = 0;
    for (const [x, y] of ring) {
      lon += x;
      lat += y;
    }
    const center: LatLon = { lat: lat / ring.length, lon: lon / ring.length };
    let radiusM = 0;
    for (const [x, y] of ring) {
      radiusM = Math.max(radiusM, haversinePlanarM(center, { lat: y, lon: x }));
    }
    circles.push({ center, radiusM, topM: b.heightM });
  }
  return circles;
}

// Local planar distance, fine at building-footprint scale.
function haversinePlanarM(a: LatLon, b: LatLon): number {
  const mPerDegLat = 111_320;
  const mPerDegLon = mPerDegLat * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((b.lat - a.lat) * mPerDegLat, (b.lon - a.lon) * mPerDegLon);
}

function crossesZone(a: LatLon, b: LatLon, zone: AirspaceZone): boolean {
  return (
    pointInPolygon(a, zone.polygon) ||
    pointInPolygon(b, zone.polygon) ||
    segmentIntersectsPolygon(a, b, zone.polygon)
  );
}

// The tallest clearance altitude hazards demand along the leg, at least baseM.
function requiredLegAltM(a: LatLon, b: LatLon, circles: HazardCircle[], baseM: number): number {
  let needed = baseM;
  for (const circle of circles) {
    const { distanceM } = segmentProjection(circle.center, a, b);
    if (distanceM <= CORRIDOR_HALF_WIDTH_M + circle.radiusM) {
      needed = Math.max(needed, circle.topM + HAZARD_CLEARANCE_M);
    }
  }
  return needed;
}

// The glide from the approach fix down to the launch point cannot climb, so a
// hazard or terrain poking into it rejects the corridor outright. Clearance
// margins taper to zero at the threshold, where descending through them is
// the landing itself.
function finalBlocked(
  approach: LatLon,
  home: LatLon,
  altM: number,
  circles: HazardCircle[],
  terrainRelM: number[] | null,
  samples: LatLon[]
): boolean {
  for (const circle of circles) {
    const { t, distanceM } = segmentProjection(circle.center, approach, home);
    if (distanceM > CORRIDOR_HALF_WIDTH_M + circle.radiusM) continue;
    const glideAltM = altM * (1 - t);
    if (circle.topM + HAZARD_CLEARANCE_M * (1 - t) > glideAltM) return true;
  }
  if (terrainRelM) {
    for (let i = 0; i < samples.length; i++) {
      const { t } = segmentProjection(samples[i], approach, home);
      const glideAltM = altM * (1 - t);
      if (glideAltM - terrainRelM[i] < TERRAIN_CLEARANCE_M * (1 - t)) return true;
    }
  }
  return false;
}

// Picks the clearest landing approach into the launch point: the corridor
// toward the vehicle when it is clear, else the nearest rotation around the
// launch point whose final avoids obstacles, terrain rise, and restricted
// airspace, raising and lengthening the approach where the inbound leg needs
// height. Controlled airspace cannot always be avoided when the launch point
// sits inside it, so crossings surface as warnings instead of rejections.
export async function pickApproach(
  home: LatLon,
  vehicle: LatLon,
  airspace: AirspaceZone[],
  obstacles: Obstacle[],
  buildings: Building[],
  maxAltitudeM: number,
  sampleElevations: ElevationSampler
): Promise<ApproachPick> {
  const restricted = airspace.filter((z) => z.restricted);
  const controlled = airspace.filter((z) => !z.restricted);
  const circles = hazardCircles(obstacles, buildings);
  const baseBearing = bearingDegrees(home, vehicle);

  const warnings: string[] = [];
  const homeElev = (await sampleElevations([home]))?.[0] ?? null;
  if (homeElev === null) {
    warnings.push('Terrain data is unavailable, so the approach is not checked against ground height.');
  }

  const relTerrain = async (points: LatLon[]): Promise<number[] | null> => {
    if (homeElev === null) return null;
    const elevations = await sampleElevations(points);
    return elevations ? elevations.map((e) => e - homeElev) : null;
  };

  for (const offset of BEARING_OFFSETS) {
    const bearing = (baseBearing + offset + 360) % 360;
    let altM = APPROACH_ALT_M;
    let distanceM = APPROACH_DISTANCE_M;
    let approach = destinationPoint(home, bearing, distanceM);

    // The inbound leg can climb over hazards and terrain, up to the ceiling;
    // a taller approach fix moves farther out to keep the glide shallow.
    const inboundTerrain = await relTerrain(pointsAlong(vehicle, approach, TERRAIN_SAMPLES));
    let needM = requiredLegAltM(vehicle, approach, circles, altM);
    if (inboundTerrain) {
      for (const rel of inboundTerrain) needM = Math.max(needM, rel + TERRAIN_CLEARANCE_M);
    }
    if (needM > maxAltitudeM) continue;
    if (needM > altM) {
      altM = Math.ceil(needM);
      distanceM = Math.max(APPROACH_DISTANCE_M, altM * GLIDE_RATIO);
      approach = destinationPoint(home, bearing, distanceM);
    }

    if (restricted.some((zone) => crossesZone(vehicle, approach, zone))) continue;
    if (restricted.some((zone) => crossesZone(approach, home, zone))) continue;

    const finalSamples = pointsAlong(approach, home, TERRAIN_SAMPLES);
    const finalTerrain = await relTerrain(finalSamples);
    if (finalBlocked(approach, home, altM, circles, finalTerrain, finalSamples)) continue;

    const crossed = controlled.filter(
      (zone) => crossesZone(vehicle, approach, zone) || crossesZone(approach, home, zone)
    );
    for (const zone of crossed) {
      warnings.push(`The approach crosses controlled airspace: ${zone.name}.`);
    }
    return { approach, altM, distanceM, bearingDeg: bearing, clear: true, warnings };
  }

  warnings.push(
    'Every approach corridor crosses an obstacle, rising terrain, or restricted airspace; flying the direct approach, watch the descent.'
  );
  return {
    approach: destinationPoint(home, baseBearing, APPROACH_DISTANCE_M),
    altM: APPROACH_ALT_M,
    distanceM: APPROACH_DISTANCE_M,
    bearingDeg: baseBearing,
    clear: false,
    warnings
  };
}
