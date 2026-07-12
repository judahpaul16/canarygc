// Samples the curved path ArduPilot flies through NAV_SPLINE_WAYPOINTs. Ports
// the hermite spline from AC_WPNav (set_spline_origin_and_destination /
// update_spline_solution), the same math Mission Planner draws, so the drawn
// curve matches the flown one: tangents come from the neighboring segments,
// stops shrink them to a 2% nudge, and the combined tangent length is clamped
// to 4x the segment length to cap overshoot on short hops.

export interface PathNode {
  lat: number;
  lng: number;
  spline: boolean;
  stop: boolean;
}

export type PathPoint = { lat: number; lng: number };

const SPLINE_SAMPLES = 32;
const STOPPED_VEL_SCALE = 0.02;
const OVERSHOOT_POS_SCALE = 4;

type Vec = { x: number; y: number };

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
const len = (a: Vec): number => Math.hypot(a.x, a.y);

// One path of sampled points per consecutive node pair; a straight destination
// yields its two endpoints, a spline destination yields the sampled curve.
export function missionSegmentPaths(nodes: PathNode[], curved: boolean): PathPoint[][] {
  if (nodes.length < 2) return [];
  const straight = (i: number): PathPoint[] => [
    { lat: nodes[i].lat, lng: nodes[i].lng },
    { lat: nodes[i + 1].lat, lng: nodes[i + 1].lng }
  ];
  if (!curved || !nodes.some((n) => n.spline)) {
    return nodes.slice(0, -1).map((_, i) => straight(i));
  }

  // Local equirectangular plane; the hermite math is linear, so any locally
  // conformal projection reproduces the shape.
  const lonScale = Math.cos((nodes[0].lat * Math.PI) / 180) || 1;
  const project = (n: PathNode): Vec => ({ x: n.lng * lonScale, y: n.lat });
  const unproject = (v: Vec): PathPoint => ({ lat: v.y, lng: v.x / lonScale });
  const pts = nodes.map(project);

  const segments: PathPoint[][] = [];
  let prevDestVel: Vec | null = null;
  for (let i = 0; i < nodes.length - 1; i++) {
    const origin = pts[i];
    const dest = pts[i + 1];
    if (!nodes[i + 1].spline) {
      segments.push(straight(i));
      prevDestVel = null;
      continue;
    }

    let originVel: Vec;
    if (i === 0 || nodes[i].stop) {
      originVel = scale(sub(dest, origin), STOPPED_VEL_SCALE);
    } else if (nodes[i].spline && prevDestVel) {
      originVel = prevDestVel;
    } else {
      originVel = sub(origin, pts[i - 1]);
    }

    let destVel: Vec;
    const next = i + 2 < nodes.length ? pts[i + 2] : null;
    if (!next || nodes[i + 1].stop) {
      destVel = scale(sub(dest, origin), STOPPED_VEL_SCALE);
    } else if (nodes[i + 2].spline) {
      destVel = sub(next, origin);
    } else {
      destVel = sub(next, dest);
    }
    prevDestVel = destVel;

    const velLen = len(originVel) + len(destVel);
    const posLen = len(sub(dest, origin)) * OVERSHOOT_POS_SCALE;
    if (velLen > posLen && velLen > 0) {
      const clamp = posLen / velLen;
      originVel = scale(originVel, clamp);
      destVel = scale(destVel, clamp);
    }

    // Hermite coefficients per AC_WPNav::update_spline_solution.
    const h2: Vec = {
      x: -3 * origin.x - 2 * originVel.x + 3 * dest.x - destVel.x,
      y: -3 * origin.y - 2 * originVel.y + 3 * dest.y - destVel.y
    };
    const h3: Vec = {
      x: 2 * origin.x + originVel.x - 2 * dest.x + destVel.x,
      y: 2 * origin.y + originVel.y - 2 * dest.y + destVel.y
    };
    const path: PathPoint[] = [];
    for (let s = 0; s <= SPLINE_SAMPLES; s++) {
      const t = s / SPLINE_SAMPLES;
      path.push(
        unproject({
          x: origin.x + originVel.x * t + h2.x * t * t + h3.x * t * t * t,
          y: origin.y + originVel.y * t + h2.y * t * t + h3.y * t * t * t
        })
      );
    }
    segments.push(path);
  }
  return segments;
}

const STOP_TYPES = new Set([
  'NAV_TAKEOFF',
  'NAV_VTOL_TAKEOFF',
  'NAV_LAND',
  'NAV_VTOL_LAND',
  'NAV_LOITER_TIME',
  'NAV_LOITER_TURNS',
  'NAV_LOITER_UNLIM',
  'NAV_PAYLOAD_PLACE',
  'NAV_RETURN_TO_LAUNCH'
]);

// A waypoint with a hold time (param1) stops the vehicle the same as a
// stopping command type, which straightens the spline tangent through it.
export function stopsAt(type: string, param1: number | string | null | undefined): boolean {
  if (STOP_TYPES.has(type)) return true;
  return (type === 'NAV_WAYPOINT' || type === 'NAV_SPLINE_WAYPOINT') && (Number(param1) || 0) > 0;
}
