import { describe, expect, it, vi } from 'vitest';
import type { MissionPlanActions } from '../stores/missionPlanStore';

// The sequence lookup and mission synthesis under test are pure; the executor
// pulls in the overlay layer, which vitest cannot load.
vi.mock('./mavlink-client', () => ({ sendMavlinkCommand: vi.fn(), setFlightMode: vi.fn() }));
vi.mock('./overlays', () => ({ notify: vi.fn() }));
vi.mock('./preflight', () => ({
	refreshAirspace: vi.fn(async () => []),
	refreshHazards: vi.fn(async () => ({ ceilings: [], obstacles: [] })),
	refreshBuildings: vi.fn(async () => [])
}));
vi.mock('./dem', () => ({ sampleElevations: vi.fn(async () => null) }));

const { landingSequenceSeq, buildAutolandMission } = await import('./landing');
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
	const home = { lat: 33.79, lon: -84.37 };
	const approach = { lat: 33.797, lon: -84.372, altM: 75 };

	it('appends a marker, the picked approach fix, and a landing at the launch point', () => {
		const { items, landStartSeq } = buildAutolandMission(plan, false, home, approach);
		expect(landStartSeq).toBe(3);
		expect(items).toHaveLength(6);
		expect(items[3].command).toBe(MISSION_COMMANDS.DO_LAND_START.id);
		expect(items[4].command).toBe(MISSION_COMMANDS.NAV_WAYPOINT.id);
		expect(items[4].lat).toBe(33.797);
		expect(items[4].lon).toBe(-84.372);
		expect(items[4].alt).toBe(75);
		const land = items[5];
		expect(land.command).toBe(MISSION_COMMANDS.NAV_LAND.id);
		expect(land.lat).toBe(33.79);
		expect(land.lon).toBe(-84.37);
		expect(land.alt).toBe(0);
	});

	it('tracks the PX4 takeoff-first reorder in the landing sequence number', () => {
		const synth = buildAutolandMission(plan, true, home, approach);
		expect(synth.landStartSeq).toBe(2);
		expect(synth.items[2].command).toBe(MISSION_COMMANDS.DO_LAND_START.id);
	});

	it('seeds a home slot when landing with no loaded plan', () => {
		const { items, landStartSeq } = buildAutolandMission({}, false, home, approach);
		expect(landStartSeq).toBe(1);
		expect(items).toHaveLength(4);
		expect(items[0].command).toBe(MISSION_COMMANDS.NAV_WAYPOINT.id);
		expect(items[0].lat).toBe(33.79);
		expect(items[1].command).toBe(MISSION_COMMANDS.DO_LAND_START.id);
		expect(items[3].command).toBe(MISSION_COMMANDS.NAV_LAND.id);
	});
});
