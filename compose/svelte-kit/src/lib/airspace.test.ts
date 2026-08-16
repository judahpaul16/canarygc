import { describe, expect, it } from 'vitest';
import { tfrZones } from './airspace';
import type { Notam } from './notams';

function notam(id: string, extra: Partial<Notam> = {}): Notam {
  return { id, type: 'TFR', description: `${id} area`, link: '', ...extra };
}

describe('tfrZones', () => {
  it('converts a boundaried TFR into a restricted zone', () => {
    const zones = tfrZones([
      notam('6/1', {
        boundary: [
          [-84, 33],
          [-86, 35],
          [-85, 34]
        ]
      })
    ]);
    expect(zones).toEqual([
      {
        name: 'TFR 6/1',
        restricted: true,
        polygon: [
          [
            [-84, 33],
            [-86, 35],
            [-85, 34]
          ]
        ],
        type: 'TFR',
        lowerM: 0
      }
    ]);
  });

  it('carries the notice ceiling as the zone upper limit', () => {
    const zones = tfrZones([
      notam('6/4', {
        ceilingM: 121.92,
        boundary: [
          [-84, 33],
          [-86, 35],
          [-85, 34]
        ]
      })
    ]);
    expect(zones[0].upperM).toBe(121.92);
    expect(zones[0].lowerM).toBe(0);
  });

  it('skips notices without a usable boundary', () => {
    expect(
      tfrZones([
        notam('6/2'),
        notam('6/3', {
          boundary: [
            [-84, 33],
            [-85, 34]
          ]
        })
      ])
    ).toEqual([]);
  });
});
