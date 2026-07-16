import type { LatLon } from './geo';
import { TILE_SIZE, decodeElevation, tilePixel, tileUrl } from './terrarium';

// Ground elevation from the terrarium raster-DEM tiles, decoded in the browser
// with a canvas.

const tileCache = new Map<string, Promise<ImageData | null>>();

function loadTile(x: number, y: number): Promise<ImageData | null> {
  const key = `${x}/${y}`;
  let pending = tileCache.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(tileUrl(x, y), { signal: AbortSignal.timeout(8_000) });
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
    results.push(decodeElevation(tile.data[i], tile.data[i + 1], tile.data[i + 2]));
  }
  return results;
}
