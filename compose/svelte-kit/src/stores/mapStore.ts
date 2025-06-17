import { writable } from 'svelte/store';
import pkg from 'maplibre-gl';

export const mapStore = writable<L.Map | null>(null);
export const markersStore = writable<Map<number, L.Marker>>(new Map());
export const polylinesStore = writable<Map<string, L.Polyline>>(new Map());
export const mapTypeStore = writable<string>('OpenStreetMap');
export const mapTileLayerStore = writable<L.TileLayer | null>(null);
export const mapZoomStore = writable<number>(18);
export const lockViewStore = writable<boolean>(true);
export const threeDMapStore = writable<pkg.Map | null>(null);