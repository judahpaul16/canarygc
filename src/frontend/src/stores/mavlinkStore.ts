import { writable } from 'svelte/store';

let L: typeof import('leaflet');
let latLng = { lat: 33.7909, lng: -84.388 };

export interface Parameter {
    param_id: string;
    param_value: number;
    param_type: number;
    param_count: number;
    param_index: number;
}

export interface ParameterMeta {
    min?: number;
    max?: number;
    increment?: number;
    description?: string;
    units?: string;
}

export const onlineStore = writable<boolean>(false);
export const mavModelStore = writable<string>('UNKNOWN');
export const mavTypeStore = writable<string>('Unknown');
export const mavArmedStateStore = writable<boolean>(false);
export const mavStateStore = writable<string>('Unknown');
export const mavModeStore = writable<string>('Unknown');
export const mavLocationStore = writable<L.LatLng | { lat: number; lng: number }>(latLng);
export const mavSatelliteStore = writable<{ total: number; hdop: number }>({ total: 0, hdop: 999.0 });
export const mavHeadingStore = writable<number>(320);
export const mavAltitudeStore = writable<number>(0);
export const mavSpeedStore = writable<number>(0);
export const mavBatteryStore = writable<number|null>(null);
export const mavlinkLogStore = writable<string[]>([]);
export const mavlinkParamStore = writable<{[key: string]: Parameter}>({});