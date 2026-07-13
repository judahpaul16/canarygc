import { describe, expect, it } from 'vitest';
import { LOCK_MS, MAX_FAILS, WINDOW_MS, lockedForMs, registerFailure } from './rate-limit';

describe('registerFailure', () => {
	it('counts failures without locking below the threshold', () => {
		let state = undefined;
		let now = 1000;
		for (let i = 1; i < MAX_FAILS; i++) {
			state = registerFailure(state, now);
			now += 1000;
			expect(state.fails).toBe(i);
			expect(lockedForMs(state, now)).toBe(0);
		}
	});

	it('locks for LOCK_MS once the threshold is crossed', () => {
		let state = undefined;
		const now = 1000;
		for (let i = 0; i < MAX_FAILS; i++) state = registerFailure(state, now);
		expect(state!.fails).toBe(MAX_FAILS);
		expect(lockedForMs(state, now)).toBe(LOCK_MS);
		expect(lockedForMs(state, now + LOCK_MS)).toBe(0);
	});

	it('starts a fresh window after the previous one ages out', () => {
		let state = registerFailure(undefined, 1000);
		state = registerFailure(state, 1000 + WINDOW_MS + 1);
		expect(state.fails).toBe(1);
		expect(lockedForMs(state, 1000 + WINDOW_MS + 1)).toBe(0);
	});
});

describe('lockedForMs', () => {
	it('returns 0 for an unknown key', () => {
		expect(lockedForMs(undefined, 1000)).toBe(0);
	});
});
