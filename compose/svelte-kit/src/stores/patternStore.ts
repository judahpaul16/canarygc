import { writable } from 'svelte/store';
import type { LatLon } from '../lib/geo';

// An active pattern capture: the planner collects corner clicks on the map
// (survey polygon corners, or the single orbit center) before the parameter
// prompt generates the waypoints.
export interface PatternCapture {
	kind: 'survey' | 'orbit';
	corners: LatLon[];
}

export const patternCaptureStore = writable<PatternCapture | null>(null);
