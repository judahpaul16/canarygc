import { haversineMeters, pointInRing, type LatLon } from './geo';
import { feetToMeters, type Obstacle, type Building } from './hazards';
import type { MissionPlanActions, MissionPlanItem } from '../stores/missionPlanStore';
import type { AirspaceZone } from './safety';

// Smart mission pathing routes around hazards without changing the order the
// operator laid out. It keeps every waypoint in sequence and, where a leg would
// cross restricted airspace or pass too close to a tall obstacle, inserts detour
// waypoints that go around the hazard (a visibility-graph shortest path over the
// buffered hazard corners). A waypoint that lands inside restricted airspace is
// nudged just outside it. The route is never reordered.

const EARTH_M_PER_DEG_LAT = 111_320;
// Buffer hazards outward by these margins so the routed path clears them rather
// than grazing the boundary.
const AIRSPACE_MARGIN_M = 60;
const OBSTACLE_KEEPOUT_M = 100;
const OBSTACLE_CLEARANCE_M = 10;
const BUILDING_MARGIN_M = 12;
const CIRCLE_SIDES = 10;
// Bounds the visibility graph so a dense hazard field cannot stall the click.
const MAX_GRAPH_VERTICES = 160;

const FIXED_TYPES = new Set(['NAV_TAKEOFF', 'NAV_RETURN_TO_LAUNCH', 'NAV_LAND', 'NAV_LOITER_UNLIM']);

function hasPosition(item: MissionPlanItem): boolean {
  return item.lat !== 0 || item.lon !== 0;
}

// A free waypoint the planner may nudge out of a no-fly zone; takeoff, land, and
// loiter keep their spot.
function isMovement(item: MissionPlanItem): boolean {
  return item.type.startsWith('NAV_') && !FIXED_TYPES.has(item.type) && hasPosition(item);
}

function toLatLon(item: MissionPlanItem): LatLon {
  return { lat: item.lat, lon: item.lon };
}

function metersPerDegLon(lat: number): number {
  return EARTH_M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

function offsetMeters(p: LatLon, eastM: number, northM: number): LatLon {
  return {
    lat: p.lat + northM / EARTH_M_PER_DEG_LAT,
    lon: p.lon + eastM / metersPerDegLon(p.lat)
  };
}

type Ring = number[][]; // [lon, lat] pairs

function ringCentroid(ring: Ring): LatLon {
  let lon = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    lon += x;
    lat += y;
  }
  return { lon: lon / ring.length, lat: lat / ring.length };
}

// Push each vertex outward from the centroid by the margin, so the routed path
// clears the true boundary by that distance.
function bufferRing(ring: Ring, marginM: number): Ring {
  const c = ringCentroid(ring);
  const perLon = metersPerDegLon(c.lat);
  return ring.map(([x, y]) => {
    const eastM = (x - c.lon) * perLon;
    const northM = (y - c.lat) * EARTH_M_PER_DEG_LAT;
    const len = Math.hypot(eastM, northM) || 1;
    const scale = (len + marginM) / len;
    return [c.lon + (eastM * scale) / perLon, c.lat + (northM * scale) / EARTH_M_PER_DEG_LAT];
  });
}

function circleRing(center: LatLon, radiusM: number): Ring {
  const ring: Ring = [];
  for (let i = 0; i < CIRCLE_SIDES; i++) {
    const angle = (i / CIRCLE_SIDES) * 2 * Math.PI;
    const p = offsetMeters(center, Math.cos(angle) * radiusM, Math.sin(angle) * radiusM);
    ring.push([p.lon, p.lat]);
  }
  ring.push(ring[0]);
  return ring;
}

// Strict segment crossing: true only when a-b and c-d cross at a point interior
// to both, so sharing an endpoint or running along a boundary does not count.
function orient(o: LatLon, a: LatLon, b: LatLon): number {
  return (a.lon - o.lon) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lon - o.lon);
}

function properCross(a: LatLon, b: LatLon, c: LatLon, d: LatLon): boolean {
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function segmentEntersRing(a: LatLon, b: LatLon, ring: Ring): boolean {
  const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
  if (pointInRing(mid, ring)) return true;
  for (let i = 0; i < ring.length - 1; i++) {
    const c = { lon: ring[i][0], lat: ring[i][1] };
    const d = { lon: ring[i + 1][0], lat: ring[i + 1][1] };
    if (properCross(a, b, c, d)) return true;
  }
  return false;
}

function segmentClear(a: LatLon, b: LatLon, rings: Ring[]): boolean {
  return !rings.some((ring) => segmentEntersRing(a, b, ring));
}

function pointInAnyRing(p: LatLon, rings: Ring[]): boolean {
  return rings.some((ring) => pointInRing(p, ring));
}

// Nearest point just outside every ring the point sits in, pushed out from the
// ring centroid past its far edge plus a margin.
function projectOut(p: LatLon, rings: Ring[]): LatLon {
  let moved = p;
  for (const ring of rings) {
    if (!pointInRing(moved, ring)) continue;
    const c = ringCentroid(ring);
    const perLon = metersPerDegLon(c.lat);
    let eastM = (moved.lon - c.lon) * perLon;
    let northM = (moved.lat - c.lat) * EARTH_M_PER_DEG_LAT;
    let len = Math.hypot(eastM, northM);
    if (len < 1) {
      eastM = 1;
      northM = 0;
      len = 1;
    }
    // Farthest ring vertex distance sets how far out is guaranteed clear.
    let maxReach = 0;
    for (const [x, y] of ring) {
      maxReach = Math.max(maxReach, Math.hypot((x - c.lon) * perLon, (y - c.lat) * EARTH_M_PER_DEG_LAT));
    }
    const scale = (maxReach + AIRSPACE_MARGIN_M) / len;
    moved = offsetMeters(c, eastM * scale, northM * scale);
  }
  return moved;
}

// Visibility-graph shortest detour from a to b around the rings. Returns the
// intermediate corners to visit, or null when no clear route is found.
function routeAround(a: LatLon, b: LatLon, rings: Ring[]): LatLon[] | null {
  const nodes: LatLon[] = [a, b];
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1 && nodes.length < MAX_GRAPH_VERTICES; i++) {
      nodes.push({ lon: ring[i][0], lat: ring[i][1] });
    }
  }

  const n = nodes.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[0] = 0;

  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!done[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1) break;
    if (u === 1) break; // reached b
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      if (!segmentClear(nodes[u], nodes[v], rings)) continue;
      const w = dist[u] + haversineMeters(nodes[u], nodes[v]);
      if (w < dist[v]) {
        dist[v] = w;
        prev[v] = u;
      }
    }
  }

  if (!isFinite(dist[1])) return null;
  const path: LatLon[] = [];
  for (let at = prev[1]; at > 1; at = prev[at]) path.unshift(nodes[at]);
  return path;
}

export interface OptimizeResult {
  actions: MissionPlanActions;
  addedWaypoints: number;
  movedWaypoints: number;
  raisedWaypoints: number;
  clearedLegs: number;
  changed: boolean;
}

const LANDING_TYPES = new Set(['NAV_RETURN_TO_LAUNCH', 'NAV_LAND', 'NAV_VTOL_LAND']);

interface VerticalHazard {
  ring: Ring;
  topM: number;
}

// Obstacles and buildings a leg could strike: each is a footprint plus the
// height of its top. Restricted airspace is kept separate since climbing cannot
// clear it.
function verticalHazards(obstacles: Obstacle[], buildings: Building[]): VerticalHazard[] {
  const hazards: VerticalHazard[] = [];
  for (const o of obstacles) {
    hazards.push({ ring: circleRing({ lat: o.lat, lon: o.lon }, OBSTACLE_KEEPOUT_M), topM: feetToMeters(o.aglFt) });
  }
  for (const b of buildings) {
    if (!b.polygon?.[0] || b.polygon[0].length < 3) continue;
    hazards.push({ ring: bufferRing(b.polygon[0], BUILDING_MARGIN_M), topM: b.heightM });
  }
  return hazards;
}

function crossesAny(a: LatLon, b: LatLon, rings: Ring[]): boolean {
  return rings.some((ring) => segmentEntersRing(a, b, ring));
}

// Landing commands descend by design, so their altitude is left alone.
function canRaise(item: MissionPlanItem): boolean {
  return !LANDING_TYPES.has(item.type);
}

export function optimizeMissionPath(
  actions: MissionPlanActions,
  airspace: AirspaceZone[] = [],
  obstacles: Obstacle[] = [],
  buildings: Building[] = [],
  maxAltitudeM = 120
): OptimizeResult {
  const indices = Object.keys(actions)
    .map(Number)
    .sort((a, b) => a - b);
  const items = indices.map((i) => ({ ...actions[i] }));

  const restrictedRings: Ring[] = airspace
    .filter((zone) => zone.restricted)
    .map((zone) => bufferRing(zone.polygon[0], AIRSPACE_MARGIN_M));
  const vHazards = verticalHazards(obstacles, buildings);
  const raised = new Set<MissionPlanItem>();

  let movedWaypoints = 0;
  let addedWaypoints = 0;
  let clearedLegs = 0;

  // Nudge any waypoint that sits inside restricted airspace back outside it.
  for (const item of items) {
    if (!isMovement(item)) continue;
    const p = toLatLon(item);
    if (pointInAnyRing(p, restrictedRings)) {
      const safe = projectOut(p, restrictedRings);
      item.lat = safe.lat;
      item.lon = safe.lon;
      movedWaypoints++;
    }
  }

  const rebuilt: MissionPlanItem[] = [];
  let prev: LatLon | null = null;
  let prevItem: MissionPlanItem | null = null;

  // Legs run between consecutive positioned items (takeoff, waypoints, land);
  // non-positioned commands (servo, delay, yaw) pass through untouched. A hazard
  // taller than the ceiling allows, or restricted airspace, forces a horizontal
  // detour; a hazard the vehicle can climb over raises the leg altitude instead.
  for (const item of items) {
    if (!hasPosition(item)) {
      rebuilt.push(item);
      continue;
    }
    const target = toLatLon(item);
    if (prev) {
      const legAlt = item.alt ?? 0;
      const unclearable = vHazards.filter((h) => h.topM + OBSTACLE_CLEARANCE_M > maxAltitudeM);
      const mustAvoid: Ring[] = [...restrictedRings, ...unclearable.map((h) => h.ring)];

      const detourPoints: LatLon[] = [];
      if (crossesAny(prev, target, mustAvoid)) {
        const detour = routeAround(prev, target, mustAvoid);
        if (detour && detour.length > 0) {
          detourPoints.push(...detour);
          clearedLegs++;
        }
      }

      // Raise the leg to clear any climbable hazard the (possibly detoured) path
      // still crosses, but never above the ceiling.
      const poly = [prev, ...detourPoints, target];
      let neededAlt = legAlt;
      for (const h of vHazards) {
        const clearAlt = h.topM + OBSTACLE_CLEARANCE_M;
        if (clearAlt > maxAltitudeM || clearAlt <= legAlt) continue;
        for (let i = 0; i < poly.length - 1; i++) {
          if (segmentEntersRing(poly[i], poly[i + 1], h.ring)) {
            neededAlt = Math.max(neededAlt, clearAlt);
            break;
          }
        }
      }

      for (const point of detourPoints) {
        rebuilt.push({
          type: 'NAV_WAYPOINT',
          lat: point.lat,
          lon: point.lon,
          alt: neededAlt,
          notes: 'Auto-routed to avoid a hazard',
          param1: null,
          param2: null,
          param3: null,
          param4: null
        });
        addedWaypoints++;
      }

      if (neededAlt > legAlt) {
        if (canRaise(item)) {
          item.alt = neededAlt;
          raised.add(item);
        }
        if (prevItem && canRaise(prevItem) && neededAlt > (prevItem.alt ?? 0)) {
          prevItem.alt = neededAlt;
          raised.add(prevItem);
        }
      }
    }
    rebuilt.push(item);
    prev = target;
    prevItem = item;
  }

  const result: MissionPlanActions = {};
  rebuilt.forEach((item, i) => {
    result[i] = item;
  });

  return {
    actions: result,
    addedWaypoints,
    movedWaypoints,
    raisedWaypoints: raised.size,
    clearedLegs,
    changed: addedWaypoints > 0 || movedWaypoints > 0 || raised.size > 0
  };
}
