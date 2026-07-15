import { describe, expect, it, vi } from 'vitest';
import type { Parameter } from '../stores/mavlinkStore';

// The plan mapping under test is pure; the writer pulls in the overlay layer,
// which vitest cannot load.
vi.mock('./mavlink-client', () => ({ writeParameter: vi.fn() }));

const { rtlAltitudePlan } = await import('./rtl-altitude');

const param = (id: string, value: number, type = 9): Parameter => ({
	param_id: id,
	param_value: value,
	param_type: type,
	param_count: 1,
	param_index: 0
});

describe('rtlAltitudePlan', () => {
	it('writes RTL_ALT in centimeters and floors RTL_CLIMB_MIN on ArduCopter', () => {
		const plan = rtlAltitudePlan('ARDUPILOTMEGA', 'Quadrotor', {
			RTL_ALT: param('RTL_ALT', 3000, 5),
			RTL_CLIMB_MIN: param('RTL_CLIMB_MIN', 1000, 9)
		});
		expect(plan.ask).toBe(true);
		expect(plan.currentM).toBe(30);
		expect(plan.writes(50)).toEqual([
			{ id: 'RTL_ALT', value: 5000, type: 5 },
			{ id: 'RTL_CLIMB_MIN', value: 0, type: 9 }
		]);
	});

	it('writes ALT_HOLD_RTL in centimeters on ArduPlane', () => {
		const plan = rtlAltitudePlan('ARDUPILOTMEGA', 'Fixed wing', {
			ALT_HOLD_RTL: param('ALT_HOLD_RTL', 10000, 6)
		});
		expect(plan.ask).toBe(true);
		expect(plan.currentM).toBe(100);
		expect(plan.writes(80)).toEqual([{ id: 'ALT_HOLD_RTL', value: 8000, type: 6 }]);
	});

	it('reports no current altitude when ArduPlane holds the engage altitude (-1)', () => {
		const plan = rtlAltitudePlan('ARDUPILOTMEGA', 'Fixed wing', {
			ALT_HOLD_RTL: param('ALT_HOLD_RTL', -1, 6)
		});
		expect(plan.currentM).toBeNull();
		expect(plan.writes(60)).toEqual([{ id: 'ALT_HOLD_RTL', value: 6000, type: 6 }]);
	});

	it('writes RTL_RETURN_ALT in meters on PX4', () => {
		const plan = rtlAltitudePlan('PX4', 'Quadrotor', {
			RTL_RETURN_ALT: param('RTL_RETURN_ALT', 60, 9)
		});
		expect(plan.ask).toBe(true);
		expect(plan.currentM).toBe(60);
		expect(plan.writes(90)).toEqual([{ id: 'RTL_RETURN_ALT', value: 90, type: 9 }]);
	});

	it('asks nothing for rovers, boats, and submarines', () => {
		for (const type of ['Ground rover', 'Surface boat', 'Submarine']) {
			const plan = rtlAltitudePlan('ARDUPILOTMEGA', type, {});
			expect(plan.ask).toBe(false);
			expect(plan.writes(50)).toEqual([]);
		}
	});

	it('writes nothing when the vehicle has not published the parameter', () => {
		const plan = rtlAltitudePlan('ARDUPILOTMEGA', 'Quadrotor', {});
		expect(plan.ask).toBe(true);
		expect(plan.currentM).toBeNull();
		expect(plan.writes(50)).toEqual([]);
	});
});
