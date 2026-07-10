import { get } from 'svelte/store';
import { safetyLimitsStore, airspaceZonesStore } from '../stores/safetyStore';
import { mavLocationStore } from '../stores/mavlinkStore';
import {
  validateMission,
  hasBlockingViolation,
  formatViolations,
  type AirspaceZone
} from './safety';
import { showModal } from './overlays';
import type { MissionPlanActions } from '../stores/missionPlanStore';

const BBOX_PAD_DEG = 0.1;

// Pull airspace covering the mission's bounding box and cache it for overlays
// and validation.
export async function refreshAirspace(actions: MissionPlanActions): Promise<AirspaceZone[]> {
  const points = Object.values(actions).filter((a) => a.lat !== 0 && a.lon !== 0);
  const home = get(mavLocationStore);
  if (home && 'lat' in home) points.push({ lat: home.lat, lon: home.lng } as never);
  if (points.length === 0) return [];

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const bbox = [
    Math.min(...lons) - BBOX_PAD_DEG,
    Math.min(...lats) - BBOX_PAD_DEG,
    Math.max(...lons) + BBOX_PAD_DEG,
    Math.max(...lats) + BBOX_PAD_DEG
  ].join(',');

  try {
    const res = await fetch(`/api/airspace?bbox=${encodeURIComponent(bbox)}`);
    const data = await res.json();
    const zones: AirspaceZone[] = data.zones ?? [];
    airspaceZonesStore.set(zones);
    return zones;
  } catch {
    return get(airspaceZonesStore);
  }
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

  const zones = await refreshAirspace(actions);
  const violations = validateMission(actions, effectiveLimits, zones);

  if (violations.length === 0) return true;

  return new Promise<boolean>((resolve) => {
    if (hasBlockingViolation(violations)) {
      showModal({
        title: 'Pre-flight check failed',
        content: `This mission cannot be started safely:\n\n${formatViolations(violations)}`,
        notification: true,
        onClose: () => resolve(false)
      });
    } else {
      showModal({
        title: 'Pre-flight warnings',
        content: `${formatViolations(violations)}\n\nStart the mission anyway?`,
        confirmation: true,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
        onClose: () => resolve(false)
      });
    }
  });
}
