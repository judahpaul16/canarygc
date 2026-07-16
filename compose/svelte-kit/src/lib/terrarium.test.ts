import { describe, expect, it } from 'vitest';
import { TILE_SIZE, TILE_Z, decodeElevation, tilePixel, tileUrl } from './terrarium';

describe('terrarium', () => {
  it('decodes the terrarium elevation encoding', () => {
    // Sea level encodes as (128, 0, 0).
    expect(decodeElevation(128, 0, 0)).toBe(0);
    // One meter above sea level.
    expect(decodeElevation(128, 1, 0)).toBe(1);
    // The blue channel carries fractions of a meter.
    expect(decodeElevation(128, 0, 128)).toBeCloseTo(0.5);
  });

  it('maps a coordinate to a tile and pixel inside it', () => {
    const { x, y, px, py } = tilePixel({ lat: 33.791, lon: -84.371 });
    const tiles = Math.pow(2, TILE_Z);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(tiles);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(tiles);
    expect(px).toBeGreaterThanOrEqual(0);
    expect(px).toBeLessThan(TILE_SIZE);
    expect(py).toBeGreaterThanOrEqual(0);
    expect(py).toBeLessThan(TILE_SIZE);
    // The equator and prime meridian land at the center of the tile grid.
    const center = tilePixel({ lat: 0, lon: 0 });
    expect(center.x).toBe(tiles / 2);
    expect(center.y).toBe(tiles / 2);
  });

  it('builds the tile URL from coordinates', () => {
    expect(tileUrl(3, 7)).toBe(`https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${TILE_Z}/3/7.png`);
  });
});
