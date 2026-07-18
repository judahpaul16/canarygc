import type { AirspaceZone } from './safety';
import { m } from '$lib/paraglide/messages';

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
  return zone.type ?? (zone.restricted ? m.as_restricted_airspace() : m.as_controlled_airspace());
}

function airspaceImplication(zone: AirspaceZone): string {
  if (zone.regime === 'eu') {
    if (zone.restricted) {
      return m.as_impl_eu_restricted();
    }
    return m.as_impl_eu_controlled();
  }
  if (zone.restricted) return m.as_impl_restricted();
  if (/moa|military|warning|alert/i.test(zone.type ?? '')) {
    return m.as_impl_special();
  }
  if (/class\s*a/i.test(zone.type ?? '')) {
    return m.as_impl_class_a({ lower: zone.lower ?? '18,000 ft MSL' });
  }
  if (zone.lower === 'Surface') {
    return m.as_impl_surface();
  }
  if (zone.lower) {
    return m.as_impl_above({ lower: zone.lower });
  }
  return m.as_impl_controlled();
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
  const floor = zone.lower ? `<br>${m.as_floor()}: ${esc(zone.lower)}` : '';
  const ceiling = zone.upper ? `<br>${m.as_ceiling()}: ${esc(zone.upper)}` : '';
  return (
    `<strong>${esc(zone.name)}</strong><br>${esc(airspaceKind(zone))}` +
    floor +
    ceiling +
    `<br><em>${esc(airspaceImplication(zone))}</em>`
  );
}
