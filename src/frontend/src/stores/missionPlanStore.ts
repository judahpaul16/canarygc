import { writable } from 'svelte/store';

interface MissionPlanItem {
    type: string;
    lat: number;
    lon: number;
    altitude: number;
    notes: string;
    notify: boolean;
}

export type MissionPlanActions = { [key: number]: MissionPlanItem };

export const missionPlanTitleStore = writable<string>('');

export const missionPlanActionsStore = writable<MissionPlanActions>({});