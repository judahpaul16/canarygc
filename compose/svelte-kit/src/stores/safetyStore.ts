import { writable } from 'svelte/store';
import { DEFAULT_SAFETY_LIMITS, type SafetyLimits, type AirspaceZone } from '../lib/safety';
import type { CeilingCell, Obstacle } from '../lib/hazards';

export const safetyLimitsStore = writable<SafetyLimits>({ ...DEFAULT_SAFETY_LIMITS });
export const airspaceZonesStore = writable<AirspaceZone[]>([]);
export const showAirspaceStore = writable<boolean>(true);
export const ceilingCellsStore = writable<CeilingCell[]>([]);
export const showCeilingsStore = writable<boolean>(false);
export const obstaclesStore = writable<Obstacle[]>([]);
export const showObstaclesStore = writable<boolean>(false);
