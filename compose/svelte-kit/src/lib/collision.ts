import type { TrafficContact } from '../stores/trafficStore';

// The ASTM F3442 small-UAS well-clear volume, a 2,000 ft horizontal and
// 250 ft vertical puck around the aircraft.
export const WELL_CLEAR_H_M = 610;
export const WELL_CLEAR_V_M = 76;
// How far ahead the projection looks for a loss of well clear.
export const THREAT_HORIZON_S = 120;

const M_PER_DEG_LAT = 111_320;
const EPS = 1e-9;

export interface Ownship {
  lat: number;
  lon: number;
  altM: number;
  headingDeg: number;
  speedMps: number;
}

export interface TrafficThreat {
  contact: TrafficContact;
  // Seconds until well clear is first lost, 0 when it already is.
  tSec: number;
  horizontalM: number;
  verticalM: number;
}

function velocity(speedMps: number | null, headingDeg: number | null): [number, number] {
  if (speedMps === null || headingDeg === null) return [0, 0];
  const rad = (headingDeg * Math.PI) / 180;
  return [speedMps * Math.sin(rad), speedMps * Math.cos(rad)];
}

// Solves a t^2 + 2 b t + c < 0, the time window where a linear relative track
// sits inside the well-clear circle.
function insideWindow(a: number, b: number, c: number): [number, number] | null {
  if (a < EPS) return c < 0 ? [-Infinity, Infinity] : null;
  const d = b * b - a * c;
  if (d <= 0) return null;
  const root = Math.sqrt(d);
  return [(-b - root) / a, (-b + root) / a];
}

// Projects both tracks linearly and reports the first loss of well clear
// inside the horizon. A contact without altitude is treated as co-altitude so
// a missing field never hides a converging track.
export function assessContact(own: Ownship, contact: TrafficContact): TrafficThreat | null {
  if (contact.onGround) return null;

  const mPerDegLon = M_PER_DEG_LAT * Math.cos((own.lat * Math.PI) / 180);
  const rx = (contact.lon - own.lon) * mPerDegLon;
  const ry = (contact.lat - own.lat) * M_PER_DEG_LAT;
  const [cvx, cvy] = velocity(contact.speedMps, contact.headingDeg);
  const [ovx, ovy] = velocity(own.speedMps, own.headingDeg);
  const vx = cvx - ovx;
  const vy = cvy - ovy;

  const horizontal = insideWindow(
    vx * vx + vy * vy,
    rx * vx + ry * vy,
    rx * rx + ry * ry - WELL_CLEAR_H_M * WELL_CLEAR_H_M
  );
  if (!horizontal) return null;

  const dz = contact.altM === null ? 0 : contact.altM - own.altM;
  const vz = contact.altM === null ? 0 : (contact.verticalRateMps ?? 0);
  let vertical: [number, number] | null;
  if (Math.abs(vz) < EPS) {
    vertical = Math.abs(dz) < WELL_CLEAR_V_M ? [-Infinity, Infinity] : null;
  } else {
    const ta = (-WELL_CLEAR_V_M - dz) / vz;
    const tb = (WELL_CLEAR_V_M - dz) / vz;
    vertical = [Math.min(ta, tb), Math.max(ta, tb)];
  }
  if (!vertical) return null;

  const start = Math.max(horizontal[0], vertical[0], 0);
  const end = Math.min(horizontal[1], vertical[1], THREAT_HORIZON_S);
  if (start >= end) return null;

  return {
    contact,
    tSec: start,
    horizontalM: Math.hypot(rx + vx * start, ry + vy * start),
    verticalM: Math.abs(dz + vz * start)
  };
}

export function detectThreats(own: Ownship, contacts: TrafficContact[]): TrafficThreat[] {
  return contacts
    .map((c) => assessContact(own, c))
    .filter((t): t is TrafficThreat => t !== null)
    .sort((a, b) => a.tSec - b.tSec);
}
