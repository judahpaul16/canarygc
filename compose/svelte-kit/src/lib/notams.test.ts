import { describe, expect, it } from 'vitest';
import {
  notamDetailLine,
  parseTfrBoundary,
  parseTfrDetail,
  tfrLink,
  unseenNotams,
  type Notam
} from './notams';

function notam(id: string, extra: Partial<Notam> = {}): Notam {
  return { id, type: 'HAZARDS', description: `${id} area`, link: tfrLink(id), ...extra };
}

const DETAIL_XML = `
  <Not>
    <dateEffective>2026-06-17T04:01:00</dateEffective>
    <dateExpire>2026-07-17T03:59:00</dateExpire>
    <codeTimeZone>EDT</codeTimeZone>
    <codeFacility>ZTL</codeFacility>
    <TfrNot>
      <aseTFRArea>
        <codeDistVerUpper>HEI</codeDistVerUpper>
        <valDistVerUpper>400</valDistVerUpper>
        <uomDistVerUpper>FT</uomDistVerUpper>
      </aseTFRArea>
    </TfrNot>
  </Not>`;

const AREA_XML = `
  <Not>
    <dateEffective>2026-06-17T04:01:00</dateEffective>
    <dateExpire>2026-07-17T03:59:00</dateExpire>
    <abdMergedArea>
      <Avx><geoLat>33.75N</geoLat><geoLong>084.39W</geoLong></Avx>
      <Avx><geoLat>33.76N</geoLat><geoLong>084.38W</geoLong></Avx>
      <Avx><geoLat>33.74N</geoLat><geoLong>084.37W</geoLong></Avx>
    </abdMergedArea>
  </Not>`;

const FLOOR_XML = `
  <Not>
    <codeDistVerUpper>HEI</codeDistVerUpper>
    <valDistVerUpper>3000</valDistVerUpper>
    <uomDistVerUpper>FT</uomDistVerUpper>
    <codeDistVerLower>HEI</codeDistVerLower>
    <valDistVerLower>1000</valDistVerLower>
    <uomDistVerLower>FT</uomDistVerLower>
  </Not>`;

describe('tfrLink', () => {
  it('builds the FAA detail URL with the slash escaped', () => {
    expect(tfrLink('6/8212')).toBe('https://tfr.faa.gov/download/detail_6_8212.xml');
  });
});

describe('parseTfrDetail', () => {
  it('reads the ceiling, active window, and controlling center', () => {
    expect(parseTfrDetail(DETAIL_XML)).toEqual({
      ceiling: '400 ft AGL',
      ceilingM: 121.92,
      effective: 'Jun 17 04:01 to Jul 17 03:59 EDT',
      facility: 'ZTL',
      boundary: undefined
    });
  });

  it('reads the ceiling in meters for a flight level', () => {
    expect(
      parseTfrDetail('<codeDistVerUpper>STD</codeDistVerUpper><valDistVerUpper>180</valDistVerUpper>').ceilingM
    ).toBeCloseTo(5486.4, 3);
  });

  it('reads the restriction boundary as [lon, lat] vertices', () => {
    expect(parseTfrDetail(AREA_XML).boundary).toEqual([
      [-84.39, 33.75],
      [-84.38, 33.76],
      [-84.37, 33.74]
    ]);
  });

  it('reads a non-surface floor', () => {
    expect(parseTfrDetail(FLOOR_XML).floor).toBe('1000 ft AGL');
  });

  it('leaves the floor unset at the surface', () => {
    expect(parseTfrDetail(DETAIL_XML).floor).toBeUndefined();
  });

  it('renders a flight-level ceiling without a reference suffix', () => {
    expect(parseTfrDetail('<codeDistVerUpper>STD</codeDistVerUpper><valDistVerUpper>180</valDistVerUpper>').ceiling).toBe('FL180');
  });

  it('returns nothing usable from empty markup', () => {
    expect(parseTfrDetail('<Not></Not>')).toEqual({
      ceiling: undefined,
      effective: undefined,
      facility: undefined
    });
  });
});

describe('notamDetailLine', () => {
  it('joins the present detail fields', () => {
    expect(
      notamDetailLine(notam('6/1', { ceiling: '400 ft AGL', facility: 'ZTL' }))
    ).toBe('Up to 400 ft AGL · ZTL Center');
  });

  it('is empty when no detail is available', () => {
    expect(notamDetailLine(notam('6/1'))).toBe('');
  });

  it('shows a floor-to-ceiling range when both bounds are present', () => {
    expect(
      notamDetailLine(notam('6/1', { floor: '1,000 ft AGL', ceiling: '3,000 ft AGL' }))
    ).toBe('1,000 ft AGL to 3,000 ft AGL');
  });
});

describe('unseenNotams', () => {
  it('drops the notices the operator already dismissed', () => {
    const items = [notam('6/1'), notam('6/2'), notam('6/3')];
    const dismissed = new Set(['6/2']);
    expect(unseenNotams(items, dismissed).map((n) => n.id)).toEqual(['6/1', '6/3']);
  });

  it('keeps every notice when nothing is dismissed', () => {
    const items = [notam('6/1'), notam('6/2')];
    expect(unseenNotams(items, new Set()).length).toBe(2);
  });

  it('returns empty when every notice is dismissed', () => {
    const items = [notam('6/1'), notam('6/2')];
    expect(unseenNotams(items, new Set(['6/1', '6/2']))).toEqual([]);
  });
});

describe('parseTfrBoundary', () => {
  it('reads Avx vertices as [lon, lat], west and south negative', () => {
    expect(parseTfrBoundary(AREA_XML)).toEqual([
      [-84.39, 33.75],
      [-84.38, 33.76],
      [-84.37, 33.74]
    ]);
  });

  it('is empty when there are no vertices', () => {
    expect(parseTfrBoundary('<Not></Not>')).toEqual([]);
  });
});
