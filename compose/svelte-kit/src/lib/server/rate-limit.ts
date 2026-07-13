// A small per-key failure limiter for the login endpoint. It is in-memory,
// which suits the single-process station: a public-IP SIM leaves the login
// reachable from the internet, so an unbounded password endpoint invites brute
// force. Keyed by client address, it locks after too many failures in a window.

export interface RateState {
	fails: number;
	firstFailAt: number;
	lockedUntil: number;
}

export const MAX_FAILS = 8;
export const WINDOW_MS = 15 * 60 * 1000;
export const LOCK_MS = 15 * 60 * 1000;

// Remaining lockout in milliseconds, or 0 when the key may attempt a login.
export function lockedForMs(state: RateState | undefined, now: number): number {
	if (!state) return 0;
	return now < state.lockedUntil ? state.lockedUntil - now : 0;
}

// Folds one failed attempt into the state, starting a fresh window once the
// previous one ages out and locking the key when the failure count crosses the
// threshold.
export function registerFailure(state: RateState | undefined, now: number): RateState {
	if (!state || now - state.firstFailAt > WINDOW_MS) {
		state = { fails: 0, firstFailAt: now, lockedUntil: 0 };
	}
	const fails = state.fails + 1;
	const lockedUntil = fails >= MAX_FAILS ? now + LOCK_MS : state.lockedUntil;
	return { fails, firstFailAt: state.firstFailAt, lockedUntil };
}

const store = new Map<string, RateState>();

export function lockedMs(key: string, now = Date.now()): number {
	return lockedForMs(store.get(key), now);
}

export function noteFailure(key: string, now = Date.now()): void {
	store.set(key, registerFailure(store.get(key), now));
	// Drop entries whose window and lock have both elapsed so the map cannot
	// grow without bound under a spray of distinct client addresses.
	for (const [k, s] of store) {
		if (now - s.firstFailAt > WINDOW_MS && now >= s.lockedUntil) store.delete(k);
	}
}

export function clearFailures(key: string): void {
	store.delete(key);
}
