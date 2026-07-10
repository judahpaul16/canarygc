import { writable } from 'svelte/store';
import { DEFAULT_SAFETY_LIMITS, type SafetyLimits, type AirspaceZone } from '../lib/safety';

export const safetyLimitsStore = writable<SafetyLimits>({ ...DEFAULT_SAFETY_LIMITS });
export const airspaceZonesStore = writable<AirspaceZone[]>([]);
export const showAirspaceStore = writable<boolean>(true);
