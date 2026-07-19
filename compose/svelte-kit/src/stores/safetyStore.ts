import { writable } from 'svelte/store';
import { DEFAULT_SAFETY_LIMITS, type SafetyLimits, type AirspaceZone } from '../lib/safety';
import type { CeilingCell, Obstacle } from '../lib/hazards';
import type { Notam } from '../lib/notams';
import { sessionBool } from '../lib/session-persisted';

export const safetyLimitsStore = writable<SafetyLimits>({ ...DEFAULT_SAFETY_LIMITS });
export const airspaceZonesStore = writable<AirspaceZone[]>([]);
// Source credits for the airspace currently loaded, shown in the map attribution.
export const airspaceAttributionsStore = writable<string[]>([]);
// Active TFRs with a boundary, drawn on the map while in effect.
export const tfrOverlaysStore = writable<Notam[]>([]);
// Air-hazard overlays stay off until an air vehicle is detected; the map
// auto-enables them then, and the session remembers manual toggles.
export const showAirspaceStore = sessionBool('map.showAirspace', false);
export const ceilingCellsStore = writable<CeilingCell[]>([]);
export const showCeilingsStore = sessionBool('map.showCeilings', false);
export const obstaclesStore = writable<Obstacle[]>([]);
export const showObstaclesStore = sessionBool('map.showObstacles', false);
