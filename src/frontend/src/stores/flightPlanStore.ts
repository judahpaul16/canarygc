import { writable } from 'svelte/store';

interface FlightPlanItem {
    type: string;
    lat: number;
    lon: number;
    altitude: number;
    notes: string;
    notify: boolean;
}

export type FlightPlanAction = { [key: number]: FlightPlanItem };

export const flightPlanTitleStore = writable<string>('');

export const flightPlanActionsStore = writable<FlightPlanAction>({});