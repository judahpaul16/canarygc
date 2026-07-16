// Temporary flight restrictions for the operating area, surfaced as persistent
// notifications that stay until the operator dismisses them. Dismissals are
// remembered so a notice never nags twice.

export interface Notam {
  id: string;
  type: string;
  description: string;
  link: string;
  // Filled from the per-TFR detail record when available.
  ceiling?: string;
  effective?: string;
  facility?: string;
}

export interface TfrDetail {
  ceiling?: string;
  effective?: string;
  facility?: string;
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

// A vertical limit reads with its reference: HEI is height above ground, ALT is
// mean sea level, STD is a flight level.
function formatAltitude(val?: string, uom?: string, code?: string): string | undefined {
  if (!val) return undefined;
  if (code === 'STD') return `FL${val}`;
  const ref = code === 'HEI' ? ' AGL' : code === 'ALT' ? ' MSL' : '';
  const unit = uom === 'FL' ? 'FL' : 'ft';
  return `${val} ${unit}${ref}`;
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
  const from = shortTime(tag(xml, 'dateEffective'));
  const to = shortTime(tag(xml, 'dateExpire'));
  const tz = tag(xml, 'codeTimeZone');
  const effective = from && to ? `${from} to ${to}${tz ? ` ${tz}` : ''}` : undefined;
  return { ceiling, effective, facility: tag(xml, 'codeFacility') };
}

export function unseenNotams(items: Notam[], dismissed: ReadonlySet<string>): Notam[] {
  return items.filter((n) => !dismissed.has(n.id));
}

export function notamDetailLine(n: Notam): string {
  const parts: string[] = [];
  if (n.ceiling) parts.push(`Up to ${n.ceiling}`);
  if (n.effective) parts.push(n.effective);
  if (n.facility) parts.push(`${n.facility} Center`);
  return parts.join(' · ');
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
