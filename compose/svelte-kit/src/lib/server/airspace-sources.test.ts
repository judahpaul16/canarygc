import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REGIONAL_SOURCES,
  regionalSourcesForBbox,
  bboxIntersectsCoverage,
  bboxWithinCoverage
} from './airspace-sources';

function mockFetch(route: (url: string) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({ ok: true, json: async () => route(String(url)) }))
  );
}

afterEach(() => vi.unstubAllGlobals());

const source = (id: string) => REGIONAL_SOURCES.find((s) => s.id === id)!;

describe('coverage gating', () => {
  it('Germany fully contains a Berlin bbox', () => {
    expect(bboxWithinCoverage(source('dipul').coverage, '13.3,52.4,13.5,52.6')).toBe(true);
  });

  it('Germany does not intersect an Atlanta bbox', () => {
    expect(bboxIntersectsCoverage(source('dipul').coverage, '-84.5,33.6,-84.3,33.8')).toBe(false);
  });

  it('selects the matching country and nothing over the US', () => {
    expect(regionalSourcesForBbox('2.3,48.8,2.4,48.9').map((s) => s.id)).toEqual(['ign']);
    expect(regionalSourcesForBbox('-84.5,33.6,-84.3,33.8')).toEqual([]);
  });
});

describe('DIPUL adapter', () => {
  it('maps a control zone to a restricted EU zone with converted altitude', async () => {
    mockFetch((url) =>
      url.includes('kontrollzonen')
        ? {
            features: [
              {
                properties: {
                  name: 'BREMEN (CTR)',
                  generated_name_EN: 'BREMEN (CTR)',
                  type_code: 'KONTROLLZONE',
                  lower_limit_altitude: 0,
                  lower_limit_unit: 'm',
                  upper_limit_altitude: 2500,
                  upper_limit_unit: 'ft'
                },
                geometry: {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [8.7, 53.0],
                      [8.9, 53.0],
                      [8.9, 53.2],
                      [8.7, 53.0]
                    ]
                  ]
                }
              }
            ]
          }
        : { features: [] }
    );
    const zones = await source('dipul').fetch('8.6,53.0,9.0,53.2');
    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({
      name: 'BREMEN (CTR)',
      restricted: true,
      regime: 'eu',
      lower: 'Surface',
      lowerM: 0
    });
    expect(zones[0].upperM).toBeCloseTo(2500 * 0.3048, 1);
  });

  it('maps a nature reserve to a controlled advisory zone', async () => {
    mockFetch((url) =>
      url.includes('naturschutzgebiete')
        ? {
            features: [
              {
                properties: { generated_name_EN: 'Wattenmeer' },
                geometry: {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [8.7, 53.0],
                      [8.9, 53.0],
                      [8.9, 53.2],
                      [8.7, 53.0]
                    ]
                  ]
                }
              }
            ]
          }
        : { features: [] }
    );
    const zones = await source('dipul').fetch('8.6,53.0,9.0,53.2');
    expect(zones).toHaveLength(1);
    expect(zones[0].restricted).toBe(false);
    expect(zones[0].type).toBe('Nature reserve');
  });
});

describe('IGN adapter', () => {
  it('marks a no-fly limit as restricted and fans out MultiPolygons', async () => {
    mockFetch(() => ({
      features: [
        {
          properties: { limite: 'Vol interdit *', remarque: 'Zone P' },
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [2.3, 48.8],
                  [2.4, 48.8],
                  [2.4, 48.9],
                  [2.3, 48.8]
                ]
              ],
              [
                [
                  [2.35, 48.85],
                  [2.36, 48.85],
                  [2.36, 48.86],
                  [2.35, 48.85]
                ]
              ]
            ]
          }
        }
      ]
    }));
    const zones = await source('ign').fetch('2.2,48.8,2.5,48.9');
    expect(zones).toHaveLength(2);
    expect(zones[0]).toMatchObject({ name: 'Zone P', restricted: true, regime: 'eu' });
  });

  it('treats a non-forbidden entry as advisory', async () => {
    mockFetch(() => ({
      features: [
        {
          properties: { limite: null, remarque: 'Notification prealable' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [2.3, 48.8],
                [2.4, 48.8],
                [2.4, 48.9],
                [2.3, 48.8]
              ]
            ]
          }
        }
      ]
    }));
    const zones = await source('ign').fetch('2.2,48.8,2.5,48.9');
    expect(zones[0].restricted).toBe(false);
    expect(zones[0].name).toBe('Notification prealable');
  });
});

describe('BAZL adapter', () => {
  it('maps an authorization-required result to a restricted EU zone', async () => {
    mockFetch(() => ({
      results: [
        {
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [7.4, 46.9],
                  [7.5, 46.9],
                  [7.5, 47.0],
                  [7.4, 46.9]
                ]
              ]
            ]
          },
          properties: {
            zone_name_en: 'Police center Bern',
            zone_restriction_id: 'REQ_AUTHORISATION.MTOM_ALL'
          }
        }
      ]
    }));
    const zones = await source('bazl').fetch('7.35,46.9,7.5,47.0');
    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({
      name: 'Police center Bern',
      restricted: true,
      regime: 'eu',
      lowerM: 0
    });
  });
});
