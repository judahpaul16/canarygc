import { writable } from 'svelte/store';

let L: typeof import('leaflet');
let latLng;

if (typeof window !== 'undefined') {
    L = (await import('leaflet')).default;
    latLng = L.latLng(33.7909, -84.3722);
} else {
    latLng = { lat: 33.7909, lng: -84.388 };
}

export const mavModelStore = writable<string>('UNKNOWN');
export const mavTypeStore = writable<string>('Unknown');
export const mavArmedStateStore = writable<boolean>(false);
export const mavStateStore = writable<string>('Unknown');
export const mavModeStore = writable<string>('Unknown');
export const mavLocationStore = writable<L.LatLng | { lat: number; lng: number }>(latLng);
export const mavHeadingStore = writable<number>(320);
export const mavAltitudeStore = writable<number>(0);
export const mavSpeedStore = writable<number>(0);
export const mavBatteryStore = writable<number|null>(null);
export const mavlinkLogStore = writable<string[]>([]);
