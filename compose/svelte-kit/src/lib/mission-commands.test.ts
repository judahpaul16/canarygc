import { describe, expect, it } from 'vitest';
import { commandNameForId, normalizeMission, MISSION_COMMANDS } from './mission-commands';
import type { MissionPlanActions } from '../stores/missionPlanStore';

const item = (type: string, extra: Partial<MissionPlanActions[number]> = {}) => ({
	type,
	lat: 33.79,
	lon: -84.37,
	alt: 30,
	notes: '',
	param1: null,
	param2: null,
	param3: null,
	param4: null,
	...extra
});

const plan: MissionPlanActions = {
	0: item('NAV_TAKEOFF'),
	1: item('NAV_SPLINE_WAYPOINT'),
	2: item('CONDITION_YAW'),
	3: item('NAV_WAYPOINT', { param1: 5 })
};

describe('normalizeMission', () => {
	it('passes the full command set through for ArduPilot', () => {
		const { items, warnings } = normalizeMission(plan, false);
		expect(items.map((i) => i.command)).toEqual([
			MISSION_COMMANDS.NAV_TAKEOFF.id,
			MISSION_COMMANDS.NAV_SPLINE_WAYPOINT.id,
			MISSION_COMMANDS.CONDITION_YAW.id,
			MISSION_COMMANDS.NAV_WAYPOINT.id
		]);
		expect(warnings).toHaveLength(0);
	});

	it('substitutes and drops for PX4 with one warning each', () => {
		const { items, warnings } = normalizeMission(plan, true);
		expect(items.map((i) => i.command)).toEqual([
			MISSION_COMMANDS.NAV_TAKEOFF.id,
			MISSION_COMMANDS.NAV_WAYPOINT.id,
			MISSION_COMMANDS.NAV_WAYPOINT.id
		]);
		expect(warnings).toHaveLength(2);
		expect(warnings[0]).toContain('NAV_SPLINE_WAYPOINT');
		expect(warnings[1]).toContain('CONDITION_YAW');
	});

	it('skips unknown commands with a warning', () => {
		const { items, warnings } = normalizeMission({ 0: item('NAV_MADE_UP') }, false);
		expect(items).toHaveLength(0);
		expect(warnings[0]).toContain('NAV_MADE_UP');
	});

	it('uses a positional frame only for positional commands and defaults null params to 0', () => {
		const { items } = normalizeMission(
			{ 0: item('NAV_WAYPOINT'), 1: item('DO_CHANGE_SPEED') },
			false
		);
		expect(items[0].frame).toBe(3);
		expect(items[1].frame).toBe(2);
		expect(items[0].param1).toBe(0);
	});
});

describe('commandNameForId', () => {
	it('round-trips ids and names', () => {
		expect(commandNameForId(MISSION_COMMANDS.NAV_TAKEOFF.id)).toBe('NAV_TAKEOFF');
		expect(commandNameForId(999999)).toBeUndefined();
	});
});
