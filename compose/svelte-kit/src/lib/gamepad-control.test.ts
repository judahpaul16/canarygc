import { describe, expect, it } from 'vitest';
import { mapGamepad } from './gamepad-control';

const pad = (axes: number[], pressed: number[] = []) => ({
	axes,
	buttons: Array.from({ length: 16 }, (_, i) => ({
		pressed: pressed.includes(i),
		touched: false,
		value: pressed.includes(i) ? 1 : 0
	}))
});

describe('mapGamepad', () => {
	it('reads neutral sticks as exact neutral through the deadzone', () => {
		// Thrust centers at 500: ArduPilot drops frames with negative z and
		// PX4 computes throttle as (z / 1000) * 2 - 1, so 500 hovers on both.
		const frame = mapGamepad(pad([0.02, -0.05, 0.07, -0.03]));
		expect(frame).toMatchObject({ x: 0, y: 0, z: 500, r: 0 });
	});

	it('maps Mode 2 axes onto MANUAL_CONTROL fields with full range', () => {
		// Left stick: up (throttle max) and full right (yaw right); right
		// stick: up (pitch forward) and full right (roll right).
		const frame = mapGamepad(pad([1, -1, 1, -1]));
		expect(frame.r).toBe(1000);
		expect(frame.z).toBe(1000);
		expect(frame.y).toBe(1000);
		expect(frame.x).toBe(1000);

		const reversed = mapGamepad(pad([-1, 1, -1, 1]));
		expect(reversed.r).toBe(-1000);
		expect(reversed.z).toBe(0);
		expect(reversed.y).toBe(-1000);
		expect(reversed.x).toBe(-1000);
	});

	it('keeps thrust in the non-negative half-range both stacks accept', () => {
		const low = mapGamepad(pad([0, 0.5, 0, 0]));
		expect(low.z).toBeGreaterThanOrEqual(0);
		expect(low.z).toBeLessThan(500);
		const high = mapGamepad(pad([0, -0.5, 0, 0]));
		expect(high.z).toBeGreaterThan(500);
		expect(high.z).toBeLessThanOrEqual(1000);
	});

	it('rescales beyond the deadzone instead of stepping', () => {
		const half = mapGamepad(pad([0.54, 0, 0, 0]));
		expect(half.r).toBeGreaterThan(400);
		expect(half.r).toBeLessThan(600);
	});

	it('packs the first sixteen buttons into the bitfield', () => {
		const frame = mapGamepad(pad([0, 0, 0, 0], [0, 3, 15]));
		expect(frame.buttons).toBe((1 << 0) | (1 << 3) | (1 << 15));
	});
});
