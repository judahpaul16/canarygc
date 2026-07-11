import type { AirspaceZone } from './safety';

export const AIRSPACE_RESTRICTED_COLOR = '#f24e4e';
export const AIRSPACE_CONTROLLED_COLOR = '#e7b908';

export function airspaceColor(zone: AirspaceZone): string {
  return zone.restricted ? AIRSPACE_RESTRICTED_COLOR : AIRSPACE_CONTROLLED_COLOR;
}

function airspaceKind(zone: AirspaceZone): string {
  return zone.type ?? (zone.restricted ? 'Restricted airspace' : 'Controlled airspace');
}

function airspaceImplication(zone: AirspaceZone): string {
  if (zone.restricted) return 'No-fly. Entry requires prior authorization.';
  if (/moa|military|warning|alert/i.test(zone.type ?? '')) {
    return 'Special-use airspace. Check activity and use caution.';
  }
  if (zone.lower === 'Surface') {
    return 'Controlled airspace down to the surface, so a UAS needs authorization (e.g. LAANC) here even at low altitude.';
  }
  if (zone.lower) {
    return `Controlled airspace above ${zone.lower}; below that is uncontrolled (Class G). A UAS needs authorization (e.g. LAANC) only within it.`;
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
