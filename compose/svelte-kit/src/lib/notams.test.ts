import { describe, expect, it } from 'vitest';
import {
  notamDetailLine,
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

describe('tfrLink', () => {
  it('builds the FAA detail URL with the slash escaped', () => {
    expect(tfrLink('6/8212')).toBe('https://tfr.faa.gov/download/detail_6_8212.xml');
  });
});

describe('parseTfrDetail', () => {
  it('reads the ceiling, active window, and controlling center', () => {
    expect(parseTfrDetail(DETAIL_XML)).toEqual({
      ceiling: '400 ft AGL',
      effective: 'Jun 17 04:01 to Jul 17 03:59 EDT',
      facility: 'ZTL'
    });
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
