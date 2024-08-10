import { writable } from 'svelte/store';

let L: typeof import('leaflet');
let latLng;

if (typeof window !== 'undefined') {
    L = (await import('leaflet')).default;
    latLng = L.latLng(33.7909, -84.3722);
} else {
    latLng = { lat: 33.7909, lng: -84.388 };
}

export const mavLocationStore = writable<L.LatLng | { lat: number; lng: number }>(latLng);
export const mavHeadingStore = writable<number>(320);

export const mapStore = writable<L.Map | null>(null);
export const markersStore = writable<Map<number, L.Marker>>(new Map());
export const polylinesStore = writable<Map<string, L.Polyline>>(new Map());
