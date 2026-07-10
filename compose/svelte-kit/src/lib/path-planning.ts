import { haversineMeters, pathLengthMeters, type LatLon } from './geo';
import type { MissionPlanActions, MissionPlanItem } from '../stores/missionPlanStore';

// Smart mission pathing: reorder the movement waypoints so the vehicle flies
// the shortest total route, while keeping fixed points (takeoff, RTL, land) in
// place. Uses a nearest-neighbor seed followed by 2-opt improvement, the
// standard open-path TSP heuristic, which is deterministic and fast for the
// dozens-of-waypoints missions this GCS handles.

const MAX_2OPT_PASSES = 20;

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

// 2-opt: repeatedly reverse the segment between two waypoints whenever doing so
// shortens the route, until no improving swap remains.
function twoOpt(start: LatLon, items: MissionPlanItem[]): MissionPlanItem[] {
  let best = [...items];
  let bestLength = routeLength(start, best);
  for (let pass = 0; pass < MAX_2OPT_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1)
        ];
        const length = routeLength(start, candidate);
        if (length < bestLength - 1e-6) {
          best = candidate;
          bestLength = length;
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
  reordered: boolean;
}

// Returns a new MissionPlanActions with the movement waypoints reordered for
// the shortest route. Fixed commands keep their index; non-positional commands
// keep their original relative order after the movement waypoints.
export function optimizeMissionPath(actions: MissionPlanActions): OptimizeResult {
  const indices = Object.keys(actions)
    .map(Number)
    .sort((a, b) => a - b);
  const items = indices.map((i) => actions[i]);

  const movement = items.filter(isMovement);
  const others = items.filter((item) => !isMovement(item));

  if (movement.length < 3) {
    return {
      actions,
      originalMeters: routeLength(toLatLon(items[0] ?? { lat: 0, lon: 0 } as MissionPlanItem), movement),
      optimizedMeters: routeLength(toLatLon(items[0] ?? { lat: 0, lon: 0 } as MissionPlanItem), movement),
      reordered: false
    };
  }

  // Anchor the route at the first fixed or movement point (usually takeoff).
  const start = toLatLon(items[0]);
  const originalMeters = routeLength(start, movement);
  const seeded = nearestNeighborOrder(start, movement);
  const optimized = twoOpt(start, seeded);
  const optimizedMeters = routeLength(start, optimized);

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
    reordered: optimizedMeters < originalMeters - 1e-6
  };
}
