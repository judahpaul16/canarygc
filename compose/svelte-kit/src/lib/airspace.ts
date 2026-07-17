import type { AirspaceZone } from './safety';

export const AIRSPACE_RESTRICTED_COLOR = '#f24e4e';
export const AIRSPACE_CONTROLLED_COLOR = '#e7b908';

// Distinct hues per class so overlapping controlled airspace stays legible;
// restricted and prohibited areas are always red, special-use is orange.
const CLASS_COLORS: [RegExp, string][] = [
  [/CLASS B\b/, '#2f6fed'],
  [/CLASS C\b/, '#d64bd6'],
  [/CLASS D\b/, '#17b6c4'],
  [/CLASS E\b/, '#e7b908'],
  [/CLASS A\b/, '#9b6ef5']
];

export function airspaceColor(zone: AirspaceZone): string {
  if (zone.restricted) return AIRSPACE_RESTRICTED_COLOR;
  const type = (zone.type ?? '').toUpperCase();
  if (/MOA|MILITARY|WARNING|ALERT/.test(type)) return '#f97316';
  for (const [pattern, color] of CLASS_COLORS) {
    if (pattern.test(type)) return color;
  }
  return AIRSPACE_CONTROLLED_COLOR;
}

function airspaceKind(zone: AirspaceZone): string {
  return zone.type ?? (zone.restricted ? 'Restricted airspace' : 'Controlled airspace');
}

function airspaceImplication(zone: AirspaceZone): string {
  if (zone.regime === 'eu') {
    if (zone.restricted) {
      return 'UAS geographical zone: operation is prohibited or requires prior authorization.';
    }
    return 'UAS geographical zone: check the applicable conditions before flying.';
  }
  if (zone.restricted) return 'No-fly. Entry requires prior authorization.';
  if (/moa|military|warning|alert/i.test(zone.type ?? '')) {
    return 'Special-use airspace. Check activity and use caution.';
  }
  if (/class\s*a/i.test(zone.type ?? '')) {
    return `High-altitude airspace from ${zone.lower ?? '18,000 ft MSL'} up; far above UAS operating altitudes, so it is not a factor for low-altitude flight.`;
  }
  if (zone.lower === 'Surface') {
    return 'Controlled airspace down to the surface, so a UAS needs authorization (e.g. LAANC) here even at low altitude.';
  }
  if (zone.lower) {
    return `Controlled airspace above ${zone.lower}; below that a UAS is in uncontrolled Class G. Authorization (e.g. LAANC) is needed only at or above the floor.`;
  }
  return 'Controlled airspace. UAS operations need authorization (e.g. LAANC).';
}

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
}

// Zone names and altitudes come from the FAA/OpenAIP feeds, so escape them
// before they reach a Leaflet or MapLibre popup's innerHTML.
export function airspacePopupHtml(zone: AirspaceZone): string {
  const floor = zone.lower ? `<br>Floor: ${esc(zone.lower)}` : '';
  const ceiling = zone.upper ? `<br>Ceiling: ${esc(zone.upper)}` : '';
  return (
    `<strong>${esc(zone.name)}</strong><br>${esc(airspaceKind(zone))}` +
    floor +
    ceiling +
    `<br><em>${esc(airspaceImplication(zone))}</em>`
  );
}
