import { describe, expect, it } from 'vitest';
import { toQgcWpl } from './mission-export';
import { parseQgcWpl } from './mission-import';
import type { MissionPlanActions } from '../stores/missionPlanStore';

const item = (type: string, lat: number, lon: number, alt: number) => ({
	type,
	lat,
	lon,
	alt,
	notes: '',
	param1: 0,
	param2: 0,
	param3: 0,
	param4: 0
});

describe('toQgcWpl', () => {
	it('writes a QGC WPL header and one row per item', () => {
		const actions: MissionPlanActions = {
			0: item('NAV_WAYPOINT', 33.7, -84.3, 0),
			1: item('NAV_WAYPOINT', 33.71, -84.31, 50),
			2: item('NAV_RETURN_TO_LAUNCH', 0, 0, 0)
		};
		const text = toQgcWpl(actions);
		const lines = text.trim().split('\n');
		expect(lines[0]).toBe('QGC WPL 110');
		expect(lines).toHaveLength(4);
		expect(lines[1].split('\t')[1]).toBe('1'); // row 0 carries the current flag
		expect(lines[2].split('\t')[1]).toBe('0');
	});

	it('round-trips through parseQgcWpl preserving command and position', () => {
		const actions: MissionPlanActions = {
			0: item('NAV_WAYPOINT', 33.79105, -84.37131, 0),
			1: item('NAV_TAKEOFF', 33.792, -84.372, 30),
			2: item('NAV_WAYPOINT', 33.793, -84.373, 60)
		};
		const parsed = parseQgcWpl(toQgcWpl(actions));
		expect(Object.keys(parsed)).toHaveLength(3);
		expect(parsed[1].type).toBe('NAV_TAKEOFF');
		expect(parsed[2].type).toBe('NAV_WAYPOINT');
		expect(parsed[1].lat).toBeCloseTo(33.792, 5);
		expect(parsed[2].alt).toBeCloseTo(60, 5);
	});
});
