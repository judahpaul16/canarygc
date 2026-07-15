import { readable, get, type Readable } from 'svelte/store';

// Shortest signed difference from `from` to `to` in (-180, 180], so a heading
// crossing 360 takes the short way round instead of spinning all the way back.
export function angleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

// One exponential step of `current` toward `target`, closing `alpha` of the gap.
export function stepToward(current: number, target: number, alpha: number): number {
  return current + (target - current) * alpha;
}

// Frame-rate-independent smoothing factor for a time constant `tau` (seconds):
// the fraction of the remaining gap to close over a frame of `dt` seconds.
export function alphaFor(dt: number, tau: number): number {
  return tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
}

const hasRaf = typeof requestAnimationFrame !== 'undefined';

interface FollowSpec<T> {
  lerp: (from: T, to: T, alpha: number) => T;
  distance: (a: T, b: T) => number;
  tau: number;
  teleport: number;
  epsilon: number;
}

// A store that chases `source` at animation-frame rate with exponential
// smoothing, so stepped telemetry renders as continuous motion. A jump beyond
// `teleport` snaps (the first fix, a GPS glitch) rather than gliding across it;
// without an animation frame (server render) the value passes straight through.
function follow<T>(source: Readable<T>, spec: FollowSpec<T>): Readable<T> {
  return readable(get(source), (set) => {
    let current = get(source);
    let target = current;
    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 1 / 60;
      last = t;
      current = spec.lerp(current, target, alphaFor(dt, spec.tau));
      if (spec.distance(current, target) < spec.epsilon) {
        current = target;
        raf = 0;
        last = 0;
      }
      set(current);
      if (raf) raf = requestAnimationFrame(frame);
    };
    const unsub = source.subscribe((v) => {
      target = v;
      if (!hasRaf || spec.distance(current, v) > spec.teleport) {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
          last = 0;
        }
        current = v;
        set(current);
        return;
      }
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      unsub();
    };
  });
}

export function smoothNumber(source: Readable<number>, tau = 0.28, teleport = Infinity): Readable<number> {
  return follow(source, {
    lerp: stepToward,
    distance: (a, b) => Math.abs(a - b),
    tau,
    teleport,
    epsilon: 1e-3
  });
}

export function smoothAngle(source: Readable<number>, tau = 0.28, teleport = 120): Readable<number> {
  return follow(source, {
    lerp: (from, to, alpha) => from + angleDelta(from, to) * alpha,
    distance: (a, b) => Math.abs(angleDelta(a, b)),
    tau,
    teleport,
    epsilon: 1e-2
  });
}

export interface LngLatLike {
  lat: number;
  lng: number;
}

export function smoothLatLng(source: Readable<LngLatLike>, tau = 0.4, teleport = 0.01): Readable<LngLatLike> {
  return follow(source, {
    lerp: (from, to, alpha) => ({
      lat: stepToward(from.lat, to.lat, alpha),
      lng: stepToward(from.lng, to.lng, alpha)
    }),
    distance: (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng),
    tau,
    teleport,
    epsilon: 1e-7
  });
}
