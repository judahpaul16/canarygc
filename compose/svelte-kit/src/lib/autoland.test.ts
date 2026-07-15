import { describe, expect, it, vi } from 'vitest';
import type { Parameter } from '../stores/mavlinkStore';

// The plan mapping under test is pure; the writer pulls in the overlay layer,
// which vitest cannot load.
vi.mock('./mavlink-client', () => ({
	writeParameter: vi.fn(),
	sendMavlinkCommand: vi.fn(),
	setFlightMode: vi.fn()
}));
vi.mock('./overlays', () => ({ notify: vi.fn() }));
vi.mock('./preflight', () => ({
	refreshAirspace: vi.fn(async () => []),
	refreshHazards: vi.fn(async () => ({ ceilings: [], obstacles: [] })),
	refreshBuildings: vi.fn(async () => [])
}));
vi.mock('./dem', () => ({ sampleElevations: vi.fn(async () => null) }));

const { autolandPlan } = await import('./autoland');

const param = (id: string, value: number, type = 9): Parameter => ({
	param_id: id,
	param_value: value,
	param_type: type,
	param_count: 1,
	param_index: 0
});

describe('autolandPlan', () => {
	it('offers RTL_AUTOLAND on an ArduPilot plane with a landing sequence', () => {
		const plan = autolandPlan(
			'ARDUPILOTMEGA',
			'Fixed wing',
			{ RTL_AUTOLAND: param('RTL_AUTOLAND', 1, 2) },
			true
		);
		expect(plan.ask).toBe(true);
		expect(plan.current).toBe(1);
		expect(plan.choices.map((c) => c.value)).toEqual([0, 1, 2, 3]);
		expect(plan.note).toContain('landing sequence');
		expect(plan.writes(2)).toEqual([{ id: 'RTL_AUTOLAND', value: 2, type: 2 }]);
	});

	it('reports no current value and writes nothing before the parameter arrives', () => {
		const plan = autolandPlan('ARDUPILOTMEGA', 'Fixed wing', {}, false);
		expect(plan.ask).toBe(true);
		expect(plan.current).toBeNull();
		expect(plan.note).toContain('no Land action');
		expect(plan.writes(1)).toEqual([]);
	});

	it('offers RTL_TYPE on a PX4 plane', () => {
		const plan = autolandPlan('PX4', 'Fixed wing', { RTL_TYPE: param('RTL_TYPE', 0, 6) }, true);
		expect(plan.ask).toBe(true);
		expect(plan.current).toBe(0);
		expect(plan.choices.map((c) => c.value)).toEqual([0, 1, 2, 3]);
		expect(plan.writes(2)).toEqual([{ id: 'RTL_TYPE', value: 2, type: 6 }]);
	});

	it('asks nothing of a copter, which lands on its own after a return', () => {
		const plan = autolandPlan('ARDUPILOTMEGA', 'Quadrotor', { RTL_AUTOLAND: param('RTL_AUTOLAND', 1) }, true);
		expect(plan.ask).toBe(false);
		expect(plan.writes(1)).toEqual([]);
	});

	it('asks nothing of ground and surface craft', () => {
		expect(autolandPlan('ARDUPILOTMEGA', 'Rover', {}, false).ask).toBe(false);
		expect(autolandPlan('PX4', 'Boat', {}, false).ask).toBe(false);
	});
});
