import { haversineMeters, pointInPolygon, pointToSegmentMeters, segmentIntersectsPolygon, type LatLon } from './geo';
import { feetToMeters, type CeilingCell, type Obstacle } from './hazards';
import type { MissionPlanActions, MissionPlanItem } from '../stores/missionPlanStore';
import { m } from '$lib/paraglide/messages';

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
  // An airspace-restriction error the operator can clear by attesting
  // authorization from the controlling agency.
  overridable?: boolean;
  // When many waypoints trip the same predicate (all inside one airspace, all
  // in a 0 ft grid), they share a group so the summary collapses them into a
  // single line with the waypoint range instead of one line each.
  group?: { key: string; noun: string };
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
  regime?: 'us' | 'eu'; // which regulator's rules apply, e.g. FAA/LAANC vs EASA
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
    violations.push({ severity: 'error', index: null, message: m.sv_no_waypoints() });
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
        message: m.sv_alt_exceeds({ index: i, alt, max: limits.maxAltitudeM })
      });
    }
    if (alt < limits.minAltitudeM) {
      violations.push({
        severity: 'error',
        index: i,
        message: m.sv_alt_below({ index: i, alt, min: limits.minAltitudeM })
      });
    }

    if (limits.home) {
      const distance = haversineMeters(limits.home, point);
      if (distance > limits.geofenceRadiusM) {
        violations.push({
          severity: 'error',
          index: i,
          message: m.sv_geofence({ index: i, distance: Math.round(distance), radius: limits.geofenceRadiusM })
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
        message: zone.restricted
          ? m.sv_inside_restricted({ index: i, zone: zone.name })
          : m.sv_inside_controlled({ index: i, zone: zone.name }),
        ...(zone.restricted ? { overridable: true } : {}),
        group: {
          key: `airspace:${zone.restricted ? 'restricted' : 'controlled'}:${zone.name}`,
          noun: zone.restricted ? m.sv_noun_restricted({ zone: zone.name }) : m.sv_noun_controlled({ zone: zone.name })
        }
      });
    }

    for (const cell of hazards.ceilings) {
      if (!pointInPolygon(point, cell.polygon)) continue;
      const ceilingM = feetToMeters(cell.ceilingFt);
      const airportSuffix = cell.airport ? ` (${cell.airport})` : '';
      if (cell.ceilingFt === 0) {
        violations.push({
          severity: 'warning',
          index: i,
          message: m.sv_laanc_zero({ index: i, airport: airportSuffix }),
          group: {
            key: `laanc-zero:${cell.airport ?? ''}`,
            noun: m.sv_noun_laanc_zero({ airport: airportSuffix })
          }
        });
      } else if (alt > ceilingM) {
        violations.push({
          severity: 'warning',
          index: i,
          message: m.sv_laanc_ceiling({ index: i, alt, ft: cell.ceilingFt, meters: Math.round(ceilingM), airport: airportSuffix })
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
          message: zone.restricted
            ? m.sv_leg_restricted({ from: from.i, to: to.i, zone: zone.name })
            : m.sv_leg_controlled({ from: from.i, to: to.i, zone: zone.name }),
          ...(zone.restricted ? { overridable: true } : {})
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
          message: m.sv_leg_obstacle({
            from: from.i,
            to: to.i,
            distance: Math.round(distance),
            height: Math.round(obstacleM),
            type: obstacle.type.toLowerCase(),
            min: Math.round(obstacleM + OBSTACLE_CLEARANCE_M)
          })
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
        message: m.sv_takeoff_alt()
      });
    }
    const firstPositional = indices.find((i) => isPositional(actions[i]));
    if (firstPositional !== undefined && firstPositional < takeoffIndex) {
      violations.push({
        severity: 'warning',
        index: takeoffIndex,
        message: m.sv_takeoff_first()
      });
    }
  }

  const lastType = actions[indices[indices.length - 1]]?.type;
  if (lastType && !LANDING_TYPES.has(lastType)) {
    violations.push({
      severity: 'warning',
      index: null,
      message: m.sv_no_landing()
    });
  }

  return violations;
}

// A bare takeoff climbs from the surface at one point, so the check covers the
// climb column at the vehicle position up to the requested altitude.
export function validateTakeoff(
  point: LatLon,
  altM: number,
  limits: SafetyLimits,
  airspace: AirspaceZone[] = [],
  hazards: Hazards = { ceilings: [], obstacles: [] }
): SafetyViolation[] {
  const violations: SafetyViolation[] = [];

  if (altM > limits.maxAltitudeM) {
    violations.push({
      severity: 'error',
      index: null,
      message: m.sv_takeoff_alt_exceeds({ alt: altM, max: limits.maxAltitudeM })
    });
  }

  for (const zone of airspace) {
    if (!pointInPolygon(point, zone.polygon)) continue;
    // The climb starts at the surface, so only a zone floor above the target
    // altitude keeps the column clear of the zone.
    if (zone.lowerM !== undefined && zone.lowerM > altM) continue;
    violations.push({
      severity: zone.restricted ? 'error' : 'warning',
      index: null,
      message: zone.restricted
        ? m.sv_takeoff_in_restricted({ zone: zone.name })
        : m.sv_takeoff_in_controlled({ zone: zone.name }),
      ...(zone.restricted ? { overridable: true } : {})
    });
  }

  for (const cell of hazards.ceilings) {
    if (!pointInPolygon(point, cell.polygon)) continue;
    const ceilingM = feetToMeters(cell.ceilingFt);
    const airportSuffix = cell.airport ? ` (${cell.airport})` : '';
    if (cell.ceilingFt === 0) {
      violations.push({
        severity: 'warning',
        index: null,
        message: m.sv_takeoff_laanc_zero({ airport: airportSuffix })
      });
    } else if (altM > ceilingM) {
      violations.push({
        severity: 'warning',
        index: null,
        message: m.sv_takeoff_laanc_ceiling({
          alt: altM,
          ft: cell.ceilingFt,
          meters: Math.round(ceilingM),
          airport: airportSuffix
        })
      });
    }
    break;
  }

  return violations;
}

// Collapses a sorted index list into compact ranges: [7,8,9,12] => "7-9, 12".
function formatIndexRanges(indices: number[]): string {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let n = 1; n <= sorted.length; n++) {
    const value = sorted[n];
    if (value === prev + 1) {
      prev = value;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = value;
    prev = value;
  }
  return parts.join(', ');
}

export function formatViolations(violations: SafetyViolation[]): string {
  const icon = (severity: Severity) => (severity === 'error' ? '⛔' : '⚠');
  const groups = new Map<string, { severity: Severity; noun: string; indices: number[] }>();
  const lines: string[] = [];

  for (const v of violations) {
    if (v.group) {
      let group = groups.get(v.group.key);
      if (!group) {
        group = { severity: v.severity, noun: v.group.noun, indices: [] };
        groups.set(v.group.key, group);
        // Reserve this group's slot in output order at its first occurrence.
        lines.push(` ${v.group.key}`);
      }
      if (v.severity === 'error') group.severity = 'error';
      if (v.index !== null) group.indices.push(v.index);
    } else {
      lines.push(`${icon(v.severity)} ${v.message}`);
    }
  }

  return lines
    .map((line) => {
      if (!line.startsWith(' ')) return line;
      const group = groups.get(line.slice(1))!;
      const label =
        group.indices.length === 1
          ? m.sv_label_one({ index: group.indices[0] })
          : m.sv_label_many({ range: formatIndexRanges(group.indices) });
      return `${icon(group.severity)} ${label} ${group.noun}.`;
    })
    .join('\n');
}
