import { writable } from 'svelte/store';

interface FlightPlanItem {
    type: string;
    lat: number;
    lon: number;
    altitude: number;
    notes: string;
    notify: boolean;
}

export type FlightPlanStore = { [key: number]: FlightPlanItem };

export const flightPlanStore = writable<FlightPlanStore>({});