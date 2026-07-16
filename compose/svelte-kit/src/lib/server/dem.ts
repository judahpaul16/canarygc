import { PNG } from 'pngjs';
import type { LatLon } from '$lib/geo';
import { TILE_SIZE, decodeElevation, tilePixel, tileUrl } from '$lib/terrarium';

// Ground elevation from the terrarium raster-DEM tiles, decoded on the server,
// for flows that run with no browser attached.

const tileCache = new Map<string, Promise<Buffer | null>>();

function loadTile(x: number, y: number): Promise<Buffer | null> {
  const key = `${x}/${y}`;
  let pending = tileCache.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(tileUrl(x, y), { signal: AbortSignal.timeout(8_000) });
        if (!res.ok) return null;
        const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
        if (png.width !== TILE_SIZE || png.height !== TILE_SIZE) return null;
        return png.data;
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
export async function sampleElevationsServer(points: LatLon[]): Promise<number[] | null> {
  const results: number[] = [];
  for (const point of points) {
    const { x, y, px, py } = tilePixel(point);
    const tile = await loadTile(x, y);
    if (!tile) return null;
    const i = (py * TILE_SIZE + px) * 4;
    results.push(decodeElevation(tile[i], tile[i + 1], tile[i + 2]));
  }
  return results;
}
