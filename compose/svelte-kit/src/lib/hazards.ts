import { m } from '$lib/paraglide/messages';

export interface CeilingCell {
  ceilingFt: number;
  airport: string;
  laanc: boolean;
  // GeoJSON Polygon coordinates, [lon, lat] rings.
  polygon: number[][][];
}

export interface Obstacle {
  lat: number;
  lon: number;
  type: string;
  aglFt: number;
  amslFt: number;
}

export interface Building {
  // GeoJSON Polygon coordinates, [lon, lat] rings.
  polygon: number[][][];
  heightM: number;
}

export const FT_TO_M = 0.3048;

export function feetToMeters(feet: number): number {
  return feet * FT_TO_M;
}

const CEILING_COLORS: [number, string][] = [
  [0, '#f24e4e'],
  [50, '#f97316'],
  [100, '#e7b908'],
  [200, '#a3e635'],
  [300, '#4ade80'],
  [400, '#22c55e']
];

export function ceilingColor(ceilingFt: number): string {
  let color = CEILING_COLORS[0][1];
  for (const [threshold, value] of CEILING_COLORS) {
    if (ceilingFt >= threshold) color = value;
  }
  return color;
}

export function obstacleColor(aglFt: number): string {
  if (aglFt >= 500) return '#f24e4e';
  if (aglFt >= 200) return '#f97316';
  return '#e7b908';
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

// Values come from the FAA feeds, so escape them before they reach a popup's
// innerHTML.
export function ceilingPopupHtml(cell: CeilingCell): string {
  const heading = cell.airport ? m.hz_airport_grid({ airport: cell.airport }) : m.hz_laanc_grid();
  const body =
    cell.ceilingFt === 0
      ? m.hz_ceil_zero()
      : cell.laanc
        ? m.hz_ceil_laanc({ ft: cell.ceilingFt })
        : m.hz_ceil_manual({ ft: cell.ceilingFt });
  return `<strong>${esc(heading)}</strong><br>${m.hz_ceiling()}: ${cell.ceilingFt} ft AGL (${Math.round(feetToMeters(cell.ceilingFt))} m)<br><em>${esc(body)}</em>`;
}

export function obstaclePopupHtml(obstacle: Obstacle): string {
  return (
    `<strong>${esc(obstacle.type)}</strong>` +
    `<br>${m.hz_height()}: ${obstacle.aglFt} ft AGL (${Math.round(feetToMeters(obstacle.aglFt))} m)` +
    `<br>${m.hz_top()}: ${obstacle.amslFt} ft MSL` +
    `<br><em>${m.hz_keep_clear()}</em>`
  );
}
