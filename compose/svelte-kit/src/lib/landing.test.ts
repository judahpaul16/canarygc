import { describe, expect, it, vi } from 'vitest';
import type { MissionPlanActions } from '../stores/missionPlanStore';

// The sequence lookup and mission synthesis under test are pure; the executor
// pulls in the overlay layer, which vitest cannot load.
vi.mock('./mavlink-client', () => ({ sendMavlinkCommand: vi.fn(), setFlightMode: vi.fn() }));

const { landingSequenceSeq, buildAutolandMission } = await import('./landing');
const { haversineMeters } = await import('./geo');
const { MISSION_COMMANDS } = await import('./mission-commands');

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

describe('buildAutolandMission', () => {
	const plan: MissionPlanActions = {
		0: item('NAV_WAYPOINT'), // home slot
		1: item('NAV_TAKEOFF'),
		2: item('NAV_WAYPOINT')
	};
	const vehicle = { lat: 33.8, lon: -84.36 };

	it('appends a marker, an approach fix, and a landing at the launch point', () => {
		const synth = buildAutolandMission(plan, false, vehicle);
		expect(synth).not.toBeNull();
		const { items, landStartSeq } = synth!;
		expect(landStartSeq).toBe(3);
		expect(items).toHaveLength(6);
		expect(items[3].command).toBe(MISSION_COMMANDS.DO_LAND_START.id);
		const approach = items[4];
		expect(approach.command).toBe(MISSION_COMMANDS.NAV_WAYPOINT.id);
		expect(approach.alt).toBe(60);
		expect(haversineMeters({ lat: 33.79, lon: -84.37 }, { lat: approach.lat, lon: approach.lon })).toBeCloseTo(800, -1);
		const land = items[5];
		expect(land.command).toBe(MISSION_COMMANDS.NAV_LAND.id);
		expect(land.lat).toBe(33.79);
		expect(land.lon).toBe(-84.37);
		expect(land.alt).toBe(0);
	});

	it('tracks the PX4 takeoff-first reorder in the landing sequence number', () => {
		const synth = buildAutolandMission(plan, true, vehicle);
		expect(synth!.landStartSeq).toBe(2);
		expect(synth!.items[2].command).toBe(MISSION_COMMANDS.DO_LAND_START.id);
	});

	it('returns null without a home slot to land at', () => {
		expect(buildAutolandMission({}, false, vehicle)).toBeNull();
	});
});
