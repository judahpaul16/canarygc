import { get } from 'svelte/store';
import {
  safetyLimitsStore,
  airspaceZonesStore,
  airspaceAttributionsStore,
  ceilingCellsStore,
  obstaclesStore
} from '../stores/safetyStore';
import { mavLocationStore } from '../stores/mavlinkStore';
import {
  validateMission,
  hasBlockingViolation,
  formatViolations,
  type AirspaceZone,
  type Hazards
} from './safety';
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

// Runs the pre-flight safety validation. Resolves true when it is safe to
// proceed. On blocking violations it shows them and resolves false; on warnings
// it asks the operator to confirm.
export async function preflightCheck(actions: MissionPlanActions): Promise<boolean> {
  const limits = get(safetyLimitsStore);
  const home = get(mavLocationStore);
  const effectiveLimits = {
    ...limits,
    home: limits.home ?? (home && 'lat' in home ? { lat: home.lat, lon: home.lng } : null)
  };

  const [zones, hazards] = await Promise.all([refreshAirspace(actions), refreshHazards(actions)]);
  const violations = validateMission(actions, effectiveLimits, zones, hazards);

  if (violations.length === 0) return true;

  return new Promise<boolean>((resolve) => {
    if (hasBlockingViolation(violations)) {
      showModal({
        title: m.pf_check_failed_title(),
        content: `${m.pf_cannot_start()}\n\n${formatViolations(violations)}`,
        notification: true,
        onClose: () => resolve(false)
      });
    } else {
      showModal({
        title: m.pf_warnings_title(),
        content: `${formatViolations(violations)}\n\n${m.pf_start_anyway()}`,
        confirmation: true,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
        onClose: () => resolve(false)
      });
    }
  });
}
