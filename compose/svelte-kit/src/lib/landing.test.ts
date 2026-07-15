import { describe, expect, it, vi } from 'vitest';
import type { MissionPlanActions } from '../stores/missionPlanStore';

// The sequence lookup under test is pure; the executor pulls in the overlay
// layer, which vitest cannot load.
vi.mock('./mavlink-client', () => ({ sendMavlinkCommand: vi.fn(), setFlightMode: vi.fn() }));

const { landingSequenceSeq } = await import('./landing');

const item = (type: string): MissionPlanActions[number] => ({
	type,
	lat: 33.79,
	lon: -84.37,
	alt: 30,
	notes: '',
	param1: null,
	param2: null,
	param3: null,
	param4: null
});

describe('landingSequenceSeq', () => {
	it('finds the NAV_LAND wire sequence on ArduPilot', () => {
		const plan: MissionPlanActions = {
			0: item('NAV_WAYPOINT'), // home slot
			1: item('NAV_TAKEOFF'),
			2: item('NAV_WAYPOINT'),
			3: item('NAV_WAYPOINT'),
			4: item('NAV_LAND')
		};
		expect(landingSequenceSeq(plan, false)).toBe(4);
	});

	it('prefers the DO_LAND_START marker when the mission carries one', () => {
		const plan: MissionPlanActions = {
			0: item('NAV_TAKEOFF'),
			1: item('NAV_WAYPOINT'),
			2: item('DO_LAND_START'),
			3: item('NAV_WAYPOINT'),
			4: item('NAV_LAND')
		};
		expect(landingSequenceSeq(plan, false)).toBe(2);
	});

	it('tracks the PX4 takeoff-first reorder', () => {
		const plan: MissionPlanActions = {
			0: item('NAV_WAYPOINT'), // home slot, dropped for PX4
			1: item('NAV_TAKEOFF'),
			2: item('NAV_WAYPOINT'),
			3: item('NAV_LAND')
		};
		expect(landingSequenceSeq(plan, true)).toBe(2);
	});

	it('returns null when the mission has no landing item', () => {
		const plan: MissionPlanActions = {
			0: item('NAV_TAKEOFF'),
			1: item('NAV_WAYPOINT'),
			2: item('NAV_RETURN_TO_LAUNCH')
		};
		expect(landingSequenceSeq(plan, false)).toBeNull();
	});
});
