import type { AirspaceZone } from './safety';

export const AIRSPACE_RESTRICTED_COLOR = '#f24e4e';
export const AIRSPACE_CONTROLLED_COLOR = '#e7b908';

export function airspaceColor(zone: AirspaceZone): string {
  return zone.restricted ? AIRSPACE_RESTRICTED_COLOR : AIRSPACE_CONTROLLED_COLOR;
}

function airspaceKind(zone: AirspaceZone): string {
  return zone.type ?? (zone.restricted ? 'Restricted airspace' : 'Controlled airspace');
}

function airspaceBand(zone: AirspaceZone): string {
  return [zone.lower, zone.upper].filter(Boolean).join(' to ');
}

function airspaceImplication(zone: AirspaceZone): string {
  if (zone.restricted) return 'No-fly. Entry requires prior authorization.';
  if (/moa|military|warning|alert/i.test(zone.type ?? '')) {
    return 'Special-use airspace. Check activity and use caution.';
  }
  return 'Controlled airspace. UAS operations need ATC authorization (e.g. LAANC).';
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

// Zone names and altitude bands come from the FAA/OpenAIP feeds, so escape them
// before they reach a Leaflet or MapLibre popup's innerHTML.
export function airspacePopupHtml(zone: AirspaceZone): string {
  const band = airspaceBand(zone);
  return (
    `<strong>${esc(zone.name)}</strong><br>${esc(airspaceKind(zone))}` +
    (band ? `<br>Altitude: ${esc(band)}` : '') +
    `<br><em>${esc(airspaceImplication(zone))}</em>`
  );
}
