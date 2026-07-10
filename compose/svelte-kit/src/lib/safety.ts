import { haversineMeters, pointInPolygon, type LatLon } from './geo';
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

function isPositional(item: MissionPlanItem): boolean {
  return item.type.startsWith('NAV_') && item.lat !== 0 && item.lon !== 0;
}

export function validateMission(
  actions: MissionPlanActions,
  limits: SafetyLimits,
  airspace: AirspaceZone[] = []
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
      if (pointInPolygon(point, zone.polygon)) {
        violations.push({
          severity: zone.restricted ? 'error' : 'warning',
          index: i,
          message: `Waypoint ${i} is inside ${zone.restricted ? 'restricted' : 'controlled'} airspace: ${zone.name}.`
        });
      }
    }
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
