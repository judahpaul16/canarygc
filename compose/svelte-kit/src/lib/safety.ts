import { haversineMeters, pointInPolygon, pointToSegmentMeters, segmentIntersectsPolygon, type LatLon } from './geo';
import { feetToMeters, type CeilingCell, type Obstacle } from './hazards';
import type { MissionPlanActions, MissionPlanItem } from '../stores/missionPlanStore';

// Pre-flight validation for a mission. These checks are advisory guards that
// run before the vehicle is armed or a mission is started; they never replace
// the autopilot's own geofence and failsafes, but they catch obviously unsafe
// plans (below-ground altitude, waypoints outside the geofence, waypoints
// inside restricted airspace) before commands are sent.

export type Severity = 'error' | 'warning';

export interface SafetyViolation {
  severity: Severity;
  index: number | null;
  message: string;
}

export interface AirspaceZone {
  name: string;
  restricted: boolean; // prohibited / restricted / danger => hard no-fly
  // GeoJSON Polygon coordinates: outer ring plus optional holes, [lon, lat].
  polygon: number[][][];
  type?: string; // class or category label, e.g. "Class E", "Restricted area", "MOA"
  lower?: string; // lower limit description, e.g. "SFC", "700 ft AGL"
  upper?: string; // upper limit description, e.g. "10000 ft MSL"
  lowerM?: number; // lower limit in meters (0 = surface); the zone starts here
  upperM?: number; // upper limit in meters; undefined = no defined ceiling
}

export interface SafetyLimits {
  maxAltitudeM: number; // ceiling above launch
  minAltitudeM: number; // floor above launch (0 = ground)
  geofenceRadiusM: number; // horizontal distance from home
  home: LatLon | null;
}

export const DEFAULT_SAFETY_LIMITS: SafetyLimits = {
  maxAltitudeM: 120, // 120 m ~= 400 ft, the common small-UAS ceiling
  minAltitudeM: 0,
  geofenceRadiusM: 1000,
  home: null
};

export interface Hazards {
  ceilings: CeilingCell[];
  obstacles: Obstacle[];
}

const OBSTACLE_WARN_RADIUS_M = 100;
const OBSTACLE_CLEARANCE_M = 10;

// Commands that conclude a mission by bringing the vehicle down or home.
const LANDING_TYPES = new Set(['NAV_RETURN_TO_LAUNCH', 'NAV_LAND', 'NAV_VTOL_LAND']);

function isPositional(item: MissionPlanItem): boolean {
  return item.type.startsWith('NAV_') && item.lat !== 0 && item.lon !== 0;
}

export function validateMission(
  actions: MissionPlanActions,
  limits: SafetyLimits,
  airspace: AirspaceZone[] = [],
  hazards: Hazards = { ceilings: [], obstacles: [] }
): SafetyViolation[] {
  const violations: SafetyViolation[] = [];
  const indices = Object.keys(actions)
    .map(Number)
    .sort((a, b) => a - b);

  if (indices.length === 0) {
    violations.push({ severity: 'error', index: null, message: 'Mission has no waypoints.' });
    return violations;
  }

  for (const i of indices) {
    const item = actions[i];
    if (!isPositional(item)) continue;
    const point: LatLon = { lat: item.lat, lon: item.lon };
    const alt = item.alt ?? 0;

    if (alt > limits.maxAltitudeM) {
      violations.push({
        severity: 'error',
        index: i,
        message: `Waypoint ${i} altitude ${alt} m exceeds the ${limits.maxAltitudeM} m ceiling.`
      });
    }
    if (alt < limits.minAltitudeM) {
      violations.push({
        severity: 'error',
        index: i,
        message: `Waypoint ${i} altitude ${alt} m is below the ${limits.minAltitudeM} m floor.`
      });
    }

    if (limits.home) {
      const distance = haversineMeters(limits.home, point);
      if (distance > limits.geofenceRadiusM) {
        violations.push({
          severity: 'error',
          index: i,
          message: `Waypoint ${i} is ${Math.round(distance)} m from home, past the ${limits.geofenceRadiusM} m geofence.`
        });
      }
    }

    for (const zone of airspace) {
      if (!pointInPolygon(point, zone.polygon)) continue;
      // A zone only applies within its vertical band, so a waypoint below its
      // floor or above its ceiling is not inside it. This keeps a low-altitude
      // waypoint from being flagged for high-floor airspace like Class A
      // (18,000 ft) or a Class E shelf (700 ft) that it passes beneath.
      if (zone.lowerM !== undefined && alt < zone.lowerM) continue;
      if (zone.upperM !== undefined && alt > zone.upperM) continue;
      violations.push({
        severity: zone.restricted ? 'error' : 'warning',
        index: i,
        message: `Waypoint ${i} is inside ${zone.restricted ? 'restricted' : 'controlled'} airspace: ${zone.name}.`
      });
    }

    for (const cell of hazards.ceilings) {
      if (!pointInPolygon(point, cell.polygon)) continue;
      const ceilingM = feetToMeters(cell.ceilingFt);
      if (cell.ceilingFt === 0) {
        violations.push({
          severity: 'warning',
          index: i,
          message: `Waypoint ${i} sits in a 0 ft LAANC grid square${cell.airport ? ` (${cell.airport})` : ''}; flying here needs manual FAA authorization.`
        });
      } else if (alt > ceilingM) {
        violations.push({
          severity: 'warning',
          index: i,
          message: `Waypoint ${i} altitude ${alt} m is above the ${cell.ceilingFt} ft (${Math.round(ceilingM)} m) LAANC ceiling here${cell.airport ? ` (${cell.airport})` : ''}.`
        });
      }
      break;
    }
  }

  // Flag legs that pass through airspace even when both endpoints sit outside it.
  const positional = indices.map((i) => ({ i, item: actions[i] })).filter((e) => isPositional(e.item));
  for (let n = 0; n < positional.length - 1; n++) {
    const from = positional[n];
    const to = positional[n + 1];
    const a: LatLon = { lat: from.item.lat, lon: from.item.lon };
    const b: LatLon = { lat: to.item.lat, lon: to.item.lon };
    for (const zone of airspace) {
      if (pointInPolygon(a, zone.polygon) || pointInPolygon(b, zone.polygon)) continue;
      if (segmentIntersectsPolygon(a, b, zone.polygon)) {
        violations.push({
          severity: zone.restricted ? 'error' : 'warning',
          index: to.i,
          message: `The leg from waypoint ${from.i} to ${to.i} crosses ${zone.restricted ? 'restricted' : 'controlled'} airspace: ${zone.name}.`
        });
      }
    }

    // The leg's guaranteed floor is the lower endpoint altitude; an obstacle
    // taller than that minus the clearance margin near the leg gets flagged.
    const legFloorM = Math.min(from.item.alt ?? 0, to.item.alt ?? 0);
    for (const obstacle of hazards.obstacles) {
      const obstacleM = feetToMeters(obstacle.aglFt);
      if (legFloorM > obstacleM + OBSTACLE_CLEARANCE_M) continue;
      const distance = pointToSegmentMeters({ lat: obstacle.lat, lon: obstacle.lon }, a, b);
      if (distance <= OBSTACLE_WARN_RADIUS_M) {
        violations.push({
          severity: 'warning',
          index: to.i,
          message: `The leg from waypoint ${from.i} to ${to.i} passes ${Math.round(distance)} m from a ${Math.round(obstacleM)} m ${obstacle.type.toLowerCase()}; plan at least ${Math.round(obstacleM + OBSTACLE_CLEARANCE_M)} m there or route around it.`
        });
      }
    }
  }

  // Mission structure: takeoff climbs, takeoff leads, and the route ends with a
  // landing command so the vehicle does not simply hold at the last waypoint.
  const takeoffIndex = indices.find(
    (i) => actions[i].type === 'NAV_TAKEOFF' || actions[i].type === 'NAV_VTOL_TAKEOFF'
  );
  if (takeoffIndex !== undefined) {
    if ((actions[takeoffIndex].alt ?? 0) <= 0) {
      violations.push({
        severity: 'warning',
        index: takeoffIndex,
        message: `Takeoff altitude should be above 0 m so the vehicle climbs before flying the route.`
      });
    }
    const firstPositional = indices.find((i) => isPositional(actions[i]));
    if (firstPositional !== undefined && firstPositional < takeoffIndex) {
      violations.push({
        severity: 'warning',
        index: takeoffIndex,
        message: `Takeoff should be the first command, but a waypoint comes before it.`
      });
    }
  }

  const lastType = actions[indices[indices.length - 1]]?.type;
  if (lastType && !LANDING_TYPES.has(lastType)) {
    violations.push({
      severity: 'warning',
      index: null,
      message: `Mission does not end with Return-to-Launch or Land; the vehicle will hold at the final waypoint.`
    });
  }

  return violations;
}

export function hasBlockingViolation(violations: SafetyViolation[]): boolean {
  return violations.some((v) => v.severity === 'error');
}

export function formatViolations(violations: SafetyViolation[]): string {
  return violations
    .map((v) => `${v.severity === 'error' ? '⛔' : '⚠'} ${v.message}`)
    .join('\n');
}
