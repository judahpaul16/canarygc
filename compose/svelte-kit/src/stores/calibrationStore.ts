import { writable } from 'svelte/store';
import type { CalKind } from '../lib/calibration';

export type CalRunStatus = 'idle' | 'running' | 'done' | 'failed';

export interface CalState {
  active: CalKind | null;
  progress: number;
  orientation: string | null;
  status: CalRunStatus;
  log: string[];
}

const initial: CalState = { active: null, progress: 0, orientation: null, status: 'idle', log: [] };

export const calibrationStore = writable<CalState>({ ...initial });

export function resetCalibration(): void {
  calibrationStore.set({ ...initial, log: [] });
}
