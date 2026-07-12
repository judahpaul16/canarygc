import { writable } from 'svelte/store';
import pkg from 'maplibre-gl';

export const mapStore = writable<L.Map | null>(null);
export const markersStore = writable<Map<number, L.Marker>>(new Map());
export const polylinesStore = writable<Map<string, L.Polyline>>(new Map());
export const mapTypeStore = writable<string>('Satellite');
export const mapTileLayerStore = writable<L.TileLayer | null>(null);
export const mapZoomStore = writable<number>(18);
export const lockViewStore = writable<boolean>(true);
export const threeDMapStore = writable<pkg.Map | null>(null);

export interface MapRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// The screen rect the persistent map frames as its interactive window; null
// means the map is a passive dimmed background.
export interface MapWindow extends MapRect {
  overlay: boolean;
}
export const mapWindowStore = writable<MapWindow | null>(null);

// The page shell (nav rail + dashboard slab read as one card); the map draws
// the slab around its window so the combined shell survives the transparent
// page background.
export const mapShellStore = writable<MapRect | null>(null);

// An opaque panel that contains the map window (the dashboard Controls card);
// the map redraws it around the window so the window reads as part of it.
export const mapPanelStore = writable<MapRect | null>(null);

export const mapFullscreenStore = writable<boolean>(false);