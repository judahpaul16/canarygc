import { writable } from 'svelte/store';
import pkg from 'maplibre-gl';
import { sessionBool, sessionString } from '../lib/session-persisted';

export const mapStore = writable<L.Map | null>(null);
export const markersStore = writable<Map<number, L.Marker>>(new Map());
export const polylinesStore = writable<Map<string, L.Polyline>>(new Map());
export const mapTypeStore = sessionString('map.type', 'Satellite');
export const mapTileLayerStore = writable<L.TileLayer | null>(null);
export const mapZoomStore = writable<number>(18);
export const lockViewStore = sessionBool('map.lockView', true);
// Bumped when a locked map is dragged, so the lock button pulses to explain
// why the camera snapped back; the 3D map bumps it and the map chrome reacts.
export const lockNudgeStore = writable(0);
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

// Sampled mission leg paths (spline curves included); the 3D map renders them
// from one geojson source so updates never tear layers down.
export const missionPathsStore = writable<{ lat: number; lng: number }[][]>([]);