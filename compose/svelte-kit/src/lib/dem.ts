import type { LatLon } from './geo';

// Ground elevation from the same keyless terrarium raster-DEM tiles the 3D
// map's terrain uses, decoded in the browser. Zoom 12 resolves to roughly
// 25 m per pixel at mid latitudes, enough for approach planning.
const TILE_URL = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
const TILE_Z = 12;
const TILE_SIZE = 256;

const tileCache = new Map<string, Promise<ImageData | null>>();

function tilePixel(point: LatLon): { x: number; y: number; px: number; py: number } {
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

function loadTile(x: number, y: number): Promise<ImageData | null> {
  const key = `${x}/${y}`;
  let pending = tileCache.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const url = TILE_URL.replace('{z}', `${TILE_Z}`).replace('{x}', `${x}`).replace('{y}', `${y}`);
        const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
        if (!res.ok) return null;
        const bitmap = await createImageBitmap(await res.blob());
        const canvas = document.createElement('canvas');
        canvas.width = TILE_SIZE;
        canvas.height = TILE_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
      } catch {
        return null;
      }
    })();
    tileCache.set(key, pending);
  }
  return pending;
}

// Elevations in meters for the points, in order; null when any tile is
// unavailable so callers treat terrain as unchecked rather than flat.
export async function sampleElevations(points: LatLon[]): Promise<number[] | null> {
  const results: number[] = [];
  for (const point of points) {
    const { x, y, px, py } = tilePixel(point);
    const tile = await loadTile(x, y);
    if (!tile) return null;
    const i = (py * TILE_SIZE + px) * 4;
    const [r, g, b] = [tile.data[i], tile.data[i + 1], tile.data[i + 2]];
    results.push(r * 256 + g + b / 256 - 32768);
  }
  return results;
}
