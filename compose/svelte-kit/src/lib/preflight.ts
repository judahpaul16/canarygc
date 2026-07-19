import { get } from 'svelte/store';
import {
  safetyLimitsStore,
  airspaceZonesStore,
  airspaceAttributionsStore,
  ceilingCellsStore,
  obstaclesStore,
  tfrOverlaysStore
} from '../stores/safetyStore';
import { tfrZones } from './airspace';
import { mavLocationStore } from '../stores/mavlinkStore';
import {
  validateMission,
  validateTakeoff,
  formatViolations,
  type AirspaceZone,
  type Hazards,
  type SafetyViolation
} from './safety';
import { recordFlightLine } from './flight-log';
import { showModal } from './overlays';
import { m } from '$lib/paraglide/messages';
import type { Building } from './hazards';
import type { MissionPlanActions } from '../stores/missionPlanStore';

const BBOX_PAD_DEG = 0.1;

function missionBbox(actions: MissionPlanActions): string | null {
  const points = Object.values(actions).filter((a) => a.lat !== 0 && a.lon !== 0);
  const home = get(mavLocationStore);
  if (home && 'lat' in home) points.push({ lat: home.lat, lon: home.lng } as never);
  if (points.length === 0) return null;

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  return [
    Math.min(...lons) - BBOX_PAD_DEG,
    Math.min(...lats) - BBOX_PAD_DEG,
    Math.max(...lons) + BBOX_PAD_DEG,
    Math.max(...lats) + BBOX_PAD_DEG
  ].join(',');
}

// Pull airspace for a bounding box and cache it in the store for overlays and
// validation.
export async function fetchAirspaceForBbox(bbox: string): Promise<AirspaceZone[]> {
  try {
    const res = await fetch(`/api/airspace?bbox=${encodeURIComponent(bbox)}`);
    const data = await res.json();
    const zones: AirspaceZone[] = data.zones ?? [];
    airspaceZonesStore.set(zones);
    airspaceAttributionsStore.set(data.attributions ?? []);
    return zones;
  } catch {
    return get(airspaceZonesStore);
  }
}

export async function fetchHazardsForBbox(bbox: string): Promise<Hazards> {
  try {
    const res = await fetch(`/api/hazards?bbox=${encodeURIComponent(bbox)}`);
    const data = await res.json();
    const hazards: Hazards = { ceilings: data.ceilings ?? [], obstacles: data.obstacles ?? [] };
    ceilingCellsStore.set(hazards.ceilings);
    obstaclesStore.set(hazards.obstacles);
    return hazards;
  } catch {
    return { ceilings: get(ceilingCellsStore), obstacles: get(obstaclesStore) };
  }
}

export async function fetchBuildingsForBbox(bbox: string): Promise<Building[]> {
  try {
    const res = await fetch(`/api/buildings?bbox=${encodeURIComponent(bbox)}`);
    const data = await res.json();
    return data.buildings ?? [];
  } catch {
    return [];
  }
}

// Mission-area convenience wrappers for the overlays and Optimize Path.
export async function refreshAirspace(actions: MissionPlanActions): Promise<AirspaceZone[]> {
  const bbox = missionBbox(actions);
  return bbox ? fetchAirspaceForBbox(bbox) : [];
}

export async function refreshHazards(actions: MissionPlanActions): Promise<Hazards> {
  const bbox = missionBbox(actions);
  return bbox ? fetchHazardsForBbox(bbox) : { ceilings: [], obstacles: [] };
}

export async function refreshBuildings(actions: MissionPlanActions): Promise<Building[]> {
  const bbox = missionBbox(actions);
  return bbox ? fetchBuildingsForBbox(bbox) : [];
}

// Shows blocking violations as a notice that resolves false, and warnings as a
// confirmation the operator can accept. A block whose errors are all airspace
// restrictions offers an authorization attestation instead of a dead end,
// because operators with an SGI waiver or COA are cleared to fly in them; the
// attestation is written to the flight log.
function confirmViolations(
  violations: SafetyViolation[],
  blocked: string,
  proceed: string
): Promise<boolean> {
  if (violations.length === 0) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    const errors = violations.filter((v) => v.severity === 'error');
    if (errors.length > 0 && errors.every((v) => v.overridable)) {
      showModal({
        title: m.pf_auth_required_title(),
        content: `${blocked}\n\n${formatViolations(violations)}\n\n${m.pf_auth_note()}`,
        confirmation: true,
        confirmLabel: m.pf_auth_proceed_btn(),
        inputs: [{ type: 'checkbox', placeholder: m.pf_auth_attest_check(), required: true }],
        onConfirm: (values) => {
          if (values[0] !== 'true') {
            resolve(false);
            return;
          }
          recordFlightLine(
            `Operator attested authorization to proceed: ${formatViolations(errors).replace(/\n/g, ' | ')}`
          );
          resolve(true);
        },
        onCancel: () => resolve(false),
        onClose: () => resolve(false)
      });
    } else if (errors.length > 0) {
      showModal({
        title: m.pf_check_failed_title(),
        content: `${blocked}\n\n${formatViolations(violations)}`,
        notification: true,
        onClose: () => resolve(false)
      });
    } else {
      showModal({
        title: m.pf_warnings_title(),
        content: `${formatViolations(violations)}\n\n${proceed}`,
        confirmation: true,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
        onClose: () => resolve(false)
      });
    }
  });
}

// Runs the pre-flight safety validation. Resolves true when it is safe to
// proceed.
export async function preflightCheck(actions: MissionPlanActions): Promise<boolean> {
  const limits = get(safetyLimitsStore);
  const home = get(mavLocationStore);
  const effectiveLimits = {
    ...limits,
    home: limits.home ?? (home && 'lat' in home ? { lat: home.lat, lon: home.lng } : null)
  };

  const [zones, hazards] = await Promise.all([refreshAirspace(actions), refreshHazards(actions)]);
  const withTfrs = [...zones, ...tfrZones(get(tfrOverlaysStore))];
  const violations = validateMission(actions, effectiveLimits, withTfrs, hazards);
  return confirmViolations(violations, m.pf_cannot_start(), m.pf_start_anyway());
}

// Validates a bare takeoff at the vehicle position against airspace, TFRs, and
// LAANC ceilings. Resolves true when it is safe to proceed.
export async function takeoffCheck(altM: number): Promise<boolean> {
  const loc = get(mavLocationStore);
  const point = { lat: loc.lat, lon: loc.lng };
  const bbox = [
    point.lon - BBOX_PAD_DEG,
    point.lat - BBOX_PAD_DEG,
    point.lon + BBOX_PAD_DEG,
    point.lat + BBOX_PAD_DEG
  ].join(',');
  const [zones, hazards] = await Promise.all([
    fetchAirspaceForBbox(bbox),
    fetchHazardsForBbox(bbox)
  ]);
  const withTfrs = [...zones, ...tfrZones(get(tfrOverlaysStore))];
  const violations = validateTakeoff(point, altM, get(safetyLimitsStore), withTfrs, hazards);
  return confirmViolations(violations, m.pf_takeoff_blocked(), m.pf_takeoff_anyway());
}
