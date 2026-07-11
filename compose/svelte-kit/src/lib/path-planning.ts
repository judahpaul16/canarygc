import { haversineMeters, pathLengthMeters, segmentIntersectsPolygon, type LatLon } from './geo';
import type { MissionPlanActions, MissionPlanItem } from '../stores/missionPlanStore';
import type { AirspaceZone } from './safety';

// Smart mission pathing: reorder the movement waypoints for the shortest route
// while keeping fixed points (takeoff, RTL, land) in place. A nearest-neighbor
// seed is refined with 2-opt, the standard open-path TSP heuristic. When
// restricted airspace is supplied, legs that cross a no-fly zone carry a large
// cost penalty so the search prefers routes that stay clear of it.

const MAX_2OPT_PASSES = 20;
// Dominates any realistic leg distance, so clearing one no-fly-zone crossing
// always outweighs a shorter route.
const CROSSING_PENALTY_M = 1_000_000;

// Commands whose position is not a free waypoint, so they keep their slot.
const FIXED_TYPES = new Set([
  'NAV_TAKEOFF',
  'NAV_RETURN_TO_LAUNCH',
  'NAV_LAND',
  'NAV_LOITER_UNLIM'
]);

// Commands with no lat/lon of their own (servo, delay, yaw, ...) stay attached
// to the waypoint they follow rather than being reordered independently.
function isMovement(item: MissionPlanItem): boolean {
  return item.type.startsWith('NAV_') && !FIXED_TYPES.has(item.type);
}

function toLatLon(item: MissionPlanItem): LatLon {
  return { lat: item.lat, lon: item.lon };
}

function nearestNeighborOrder(start: LatLon, items: MissionPlanItem[]): MissionPlanItem[] {
  const remaining = [...items];
  const ordered: MissionPlanItem[] = [];
  let current = start;
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMeters(current, toLatLon(remaining[i]));
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next);
    current = toLatLon(next);
  }
  return ordered;
}

function routeLength(start: LatLon, items: MissionPlanItem[]): number {
  return pathLengthMeters([start, ...items.map(toLatLon)]);
}

function routeCrossings(start: LatLon, items: MissionPlanItem[], airspace: AirspaceZone[]): number {
  if (airspace.length === 0) return 0;
  const points = [start, ...items.map(toLatLon)];
  let count = 0;
  for (let i = 0; i < points.length - 1; i++) {
    for (const zone of airspace) {
      if (zone.restricted && segmentIntersectsPolygon(points[i], points[i + 1], zone.polygon)) count++;
    }
  }
  return count;
}

function routeCost(start: LatLon, items: MissionPlanItem[], airspace: AirspaceZone[]): number {
  return routeLength(start, items) + CROSSING_PENALTY_M * routeCrossings(start, items, airspace);
}

// 2-opt: repeatedly reverse the segment between two waypoints whenever doing so
// shortens the route, until no improving swap remains.
function twoOpt(start: LatLon, items: MissionPlanItem[], airspace: AirspaceZone[]): MissionPlanItem[] {
  let best = [...items];
  let bestCost = routeCost(start, best, airspace);
  for (let pass = 0; pass < MAX_2OPT_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1)
        ];
        const cost = routeCost(start, candidate, airspace);
        if (cost < bestCost - 1e-6) {
          best = candidate;
          bestCost = cost;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

export interface OptimizeResult {
  actions: MissionPlanActions;
  originalMeters: number;
  optimizedMeters: number;
  avoidedCrossings: number;
  reordered: boolean;
}

// Returns a new MissionPlanActions with the movement waypoints reordered for
// the shortest route. Fixed commands keep their index; non-positional commands
// keep their original relative order after the movement waypoints.
export function optimizeMissionPath(actions: MissionPlanActions, airspace: AirspaceZone[] = []): OptimizeResult {
  const indices = Object.keys(actions)
    .map(Number)
    .sort((a, b) => a - b);
  const items = indices.map((i) => actions[i]);

  const movement = items.filter(isMovement);
  const others = items.filter((item) => !isMovement(item));

  if (movement.length < 3) {
    const meters = routeLength(toLatLon(items[0] ?? ({ lat: 0, lon: 0 } as MissionPlanItem)), movement);
    return {
      actions,
      originalMeters: meters,
      optimizedMeters: meters,
      avoidedCrossings: 0,
      reordered: false
    };
  }

  // Anchor the route at the first fixed or movement point (usually takeoff).
  const start = toLatLon(items[0]);
  const originalMeters = routeLength(start, movement);
  const originalCost = routeCost(start, movement, airspace);
  const seeded = nearestNeighborOrder(start, movement);
  const optimized = twoOpt(start, seeded, airspace);
  const optimizedMeters = routeLength(start, optimized);
  const optimizedCost = routeCost(start, optimized, airspace);
  const avoidedCrossings = Math.max(
    0,
    routeCrossings(start, movement, airspace) - routeCrossings(start, optimized, airspace)
  );

  // Reassemble: fixed items keep their slot, movement waypoints fill the rest
  // in optimized order, remaining non-positional commands trail at the end.
  const rebuilt: MissionPlanItem[] = [];
  let movePtr = 0;
  for (const item of items) {
    if (FIXED_TYPES.has(item.type)) rebuilt.push(item);
    else if (isMovement(item)) rebuilt.push(optimized[movePtr++]);
  }
  for (const item of others) {
    if (!FIXED_TYPES.has(item.type)) rebuilt.push(item);
  }

  const result: MissionPlanActions = {};
  rebuilt.forEach((item, i) => {
    result[i] = item;
  });

  return {
    actions: result,
    originalMeters,
    optimizedMeters,
    avoidedCrossings,
    reordered: optimizedCost < originalCost - 1e-6
  };
}
