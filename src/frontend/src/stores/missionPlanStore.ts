import { writable } from 'svelte/store';

export interface MissionPlanItem {
    type: string;
    lat: number;
    lon: number;
    alt: number | null;
    notes: string;
    param1: number | null;
    param2: number | null;
    param3: number | null;
    param4: number | null;
    [key: string]: any; // Allow string indexing
}

export type MissionPlanActions = { [key: number]: MissionPlanItem };

export const missionPlanTitleStore = writable<string>('');

export const missionPlanActionsStore = writable<MissionPlanActions>({});