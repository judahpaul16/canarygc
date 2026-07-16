import type { LatLon } from './geo';

// Tile math and pixel decoding for the keyless terrarium raster-DEM tiles the
// 3D map's terrain and the landing-approach planners sample. Zoom 12 resolves
// to roughly 25 m per pixel at mid latitudes, enough for approach planning.
export const TILE_URL = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
export const TILE_Z = 12;
export const TILE_SIZE = 256;

export function tileUrl(x: number, y: number): string {
  return TILE_URL.replace('{z}', `${TILE_Z}`).replace('{x}', `${x}`).replace('{y}', `${y}`);
}

export function tilePixel(point: LatLon): { x: number; y: number; px: number; py: number } {
  const scale = TILE_SIZE * Math.pow(2, TILE_Z);
  const worldX = ((point.lon + 180) / 360) * scale;
  const latRad = (point.lat * Math.PI) / 180;
  const worldY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;
  return {
    x: Math.floor(worldX / TILE_SIZE),
    y: Math.floor(worldY / TILE_SIZE),
    px: Math.min(TILE_SIZE - 1, Math.floor(worldX % TILE_SIZE)),
    py: Math.min(TILE_SIZE - 1, Math.floor(worldY % TILE_SIZE))
  };
}

// Terrarium encodes elevation across the red, green, and blue channels.
export function decodeElevation(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}
