// Temporary flight restrictions for the operating area, surfaced as persistent
// notifications that stay until the operator dismisses them. Dismissals are
// remembered so a notice never nags twice.

import { m } from '$lib/paraglide/messages';

export interface Notam {
  id: string;
  type: string;
  description: string;
  link: string;
  // Filled from the per-TFR detail record when available.
  ceiling?: string;
  ceilingM?: number;
  floor?: string;
  effective?: string;
  facility?: string;
  boundary?: [number, number][];
}

export interface TfrDetail {
  ceiling?: string;
  ceilingM?: number;
  floor?: string;
  effective?: string;
  facility?: string;
  boundary?: [number, number][];
}

const DISMISSED_KEY = 'notams.dismissed';
// Old dismissals age out of storage once the list grows past this; an expired
// TFR stops being served long before its id cycles back.
const DISMISSED_CAP = 300;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

export function tfrLink(id: string): string {
  return `https://tfr.faa.gov/download/detail_${id.replace(/\//g, '_')}.xml`;
}

function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}>([^<]+)</${name}>`));
  return m ? m[1].trim() : undefined;
}

// "33.79418179N" / "084.37416667W" with south and west reading negative.
function parseCoord(raw?: string): number | undefined {
  if (!raw) return undefined;
  const m = raw.match(/^(\d+(?:\.\d+)?)([NSEW])$/);
  if (!m) return undefined;
  const val = parseFloat(m[1]);
  return m[2] === 'S' || m[2] === 'W' ? -val : val;
}

// The restriction boundary is the ordered list of Avx vertices, emitted
// [lon, lat] to match the airspace polygons the map already draws.
export function parseTfrBoundary(xml: string): [number, number][] {
  const ring: [number, number][] = [];
  const avx = /<Avx>([\s\S]*?)<\/Avx>/g;
  let m: RegExpExecArray | null;
  while ((m = avx.exec(xml))) {
    const lat = parseCoord(tag(m[1], 'geoLat'));
    const lon = parseCoord(tag(m[1], 'geoLong'));
    if (lat !== undefined && lon !== undefined) ring.push([lon, lat]);
  }
  return ring;
}

// A vertical limit reads with its reference: HEI is height above ground, ALT is
// mean sea level, STD is a flight level.
function formatAltitude(val?: string, uom?: string, code?: string): string | undefined {
  if (!val) return undefined;
  if (code === 'STD') return `FL${val}`;
  const ref = code === 'HEI' ? ' AGL' : code === 'ALT' ? ' MSL' : '';
  const unit = uom === 'FL' ? 'FL' : 'ft';
  return `${val} ${unit}${ref}`;
}

const FT_TO_M = 0.3048;

function altitudeMeters(val?: string, uom?: string, code?: string): number | undefined {
  if (!val) return undefined;
  const n = parseFloat(val);
  if (!Number.isFinite(n)) return undefined;
  if (code === 'STD' || uom === 'FL') return n * 100 * FT_TO_M;
  if (uom === 'M') return n;
  return n * FT_TO_M;
}

// The FAA times are local to the TFR's own zone, so the parts render verbatim
// rather than through a Date that would shift them to the browser zone.
function shortTime(iso?: string): string | undefined {
  if (!iso) return undefined;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const [, , mo, d, hh, mm] = m;
  return `${MONTHS[parseInt(mo, 10) - 1]} ${parseInt(d, 10)} ${hh}:${mm}`;
}

export function parseTfrDetail(xml: string): TfrDetail {
  const ceiling = formatAltitude(
    tag(xml, 'valDistVerUpper'),
    tag(xml, 'uomDistVerUpper'),
    tag(xml, 'codeDistVerUpper')
  );
  const ceilingM = altitudeMeters(
    tag(xml, 'valDistVerUpper'),
    tag(xml, 'uomDistVerUpper'),
    tag(xml, 'codeDistVerUpper')
  );
  const lowerVal = tag(xml, 'valDistVerLower');
  const floor =
    lowerVal && lowerVal !== '0'
      ? formatAltitude(lowerVal, tag(xml, 'uomDistVerLower'), tag(xml, 'codeDistVerLower'))
      : undefined;
  const from = shortTime(tag(xml, 'dateEffective'));
  const to = shortTime(tag(xml, 'dateExpire'));
  const tz = tag(xml, 'codeTimeZone');
  const effective = from && to ? `${from} to ${to}${tz ? ` ${tz}` : ''}` : undefined;
  const boundary = parseTfrBoundary(xml);
  return {
    ceiling,
    ceilingM,
    floor,
    effective,
    facility: tag(xml, 'codeFacility'),
    boundary: boundary.length >= 3 ? boundary : undefined
  };
}

export function unseenNotams(items: Notam[], dismissed: ReadonlySet<string>): Notam[] {
  return items.filter((n) => !dismissed.has(n.id));
}

export function notamDetailLine(n: Notam): string {
  const parts: string[] = [];
  if (n.floor && n.ceiling) parts.push(m.notam_range({ floor: n.floor, ceiling: n.ceiling }));
  else if (n.ceiling) parts.push(m.notam_up_to({ ceiling: n.ceiling }));
  if (n.effective) parts.push(n.effective);
  if (n.facility) parts.push(m.notam_center({ facility: n.facility }));
  return parts.join(' · ');
}

// The FAA description tails with a verbose date range the detail line already
// states precisely, so only the leading place stays.
export function cleanTfrDescription(desc: string): string {
  return desc.replace(/,?\s*(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*,.*$/, '').trim();
}

export function loadDismissedNotams(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export function recordDismissedNotam(id: string): void {
  if (typeof localStorage === 'undefined') return;
  const ids = [...loadDismissedNotams()];
  if (!ids.includes(id)) ids.push(id);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-DISMISSED_CAP)));
}
