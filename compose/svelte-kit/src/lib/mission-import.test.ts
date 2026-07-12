import { describe, expect, it } from 'vitest';
import { parseMissionFile, parseQgcPlan, parseQgcWpl } from './mission-import';

const wpl = `QGC WPL 110
0\t1\t0\t16\t0\t0\t0\t0\t33.75\t-84.39\t300\t1
1\t0\t3\t22\t0\t0\t0\t0\t33.751\t-84.391\t10\t1
2\t0\t3\t82\t0\t0\t0\t0\t33.752\t-84.392\t30\t1
3\t0\t3\t99999\t0\t0\t0\t0\t0\t0\t0\t1`;

const plan = {
	fileType: 'Plan',
	mission: {
		plannedHomePosition: [33.75, -84.39, 300],
		items: [
			{ type: 'SimpleItem', command: 22, params: [0, 0, 0, null, 33.751, -84.391, 10] },
			{ type: 'ComplexItem', command: 16 },
			{ type: 'SimpleItem', command: 16, params: [5, 0, 0, 0, 33.752, -84.392, 30] }
		]
	}
};

describe('parseQgcWpl', () => {
	it('parses rows into typed actions and skips unknown commands', () => {
		const actions = parseQgcWpl(wpl);
		expect(actions[0].type).toBe('NAV_WAYPOINT');
		expect(actions[1].type).toBe('NAV_TAKEOFF');
		expect(actions[2].type).toBe('NAV_SPLINE_WAYPOINT');
		expect(actions[3]).toBeUndefined();
		expect(actions[1].lat).toBeCloseTo(33.751, 6);
		expect(actions[1].alt).toBe(10);
	});

	it('rejects files without the header or without items', () => {
		expect(() => parseQgcWpl('not a wpl file')).toThrow();
		expect(() => parseQgcWpl('QGC WPL 110')).toThrow();
	});
});

describe('parseQgcPlan', () => {
	it('parses the home position and simple items, skipping complex items', () => {
		const actions = parseQgcPlan(plan);
		expect(actions[0].type).toBe('NAV_WAYPOINT');
		expect(actions[0].lat).toBeCloseTo(33.75, 6);
		expect(actions[1].type).toBe('NAV_TAKEOFF');
		expect(actions[2].type).toBe('NAV_WAYPOINT');
		expect(actions[2].param1).toBe(5);
		expect(Object.keys(actions)).toHaveLength(3);
	});

	it('rejects a plan without mission items', () => {
		expect(() => parseQgcPlan({})).toThrow();
	});
});

describe('parseMissionFile', () => {
	it('routes by content across the three formats', () => {
		expect(parseMissionFile('mission.waypoints', wpl).actions[1].type).toBe('NAV_TAKEOFF');
		expect(parseMissionFile('mission.plan', JSON.stringify(plan)).actions[1].type).toBe(
			'NAV_TAKEOFF'
		);
	});
});
