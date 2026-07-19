import { describe, expect, it } from 'vitest';
import { validateMission, validateTakeoff, formatViolations, type AirspaceZone, type SafetyViolation } from './safety';
import { DEFAULT_SAFETY_LIMITS } from './safety';
import type { MissionPlanActions } from '../stores/missionPlanStore';

// A square of controlled airspace around a patch near Atlanta.
const zone: AirspaceZone = {
	name: 'TEST CLASS E',
	restricted: false,
	polygon: [
		[
			[-84.4, 33.74],
			[-84.38, 33.74],
			[-84.38, 33.76],
			[-84.4, 33.76],
			[-84.4, 33.74]
		]
	]
};

function waypoint(): MissionPlanActions[number] {
	return { type: 'NAV_WAYPOINT', lat: 33.75, lon: -84.39, alt: 50, notes: '', param1: null, param2: null, param3: null, param4: null };
}

describe('formatViolations grouping', () => {
	it('collapses per-waypoint airspace warnings into one line with a range', () => {
		const actions: MissionPlanActions = { 1: waypoint(), 2: waypoint(), 3: waypoint() };
		const violations = validateMission(actions, DEFAULT_SAFETY_LIMITS, [zone]);
		const text = formatViolations(violations);

		const airspaceLines = text.split('\n').filter((l) => l.includes('TEST CLASS E'));
		expect(airspaceLines).toHaveLength(1);
		expect(airspaceLines[0]).toContain('Waypoints 1-3');
		expect(airspaceLines[0]).toContain('inside controlled airspace: TEST CLASS E');
	});

	it('renders non-contiguous indices as separate ranges', () => {
		const grouped: SafetyViolation[] = [1, 2, 3, 7].map((i) => ({
			severity: 'warning',
			index: i,
			message: `Waypoint ${i} is inside controlled airspace: ATL.`,
			group: { key: 'airspace:controlled:ATL', noun: 'inside controlled airspace: ATL' }
		}));
		expect(formatViolations(grouped)).toBe('⚠ Waypoints 1-3, 7 inside controlled airspace: ATL.');
	});

	it('keeps a single grouped waypoint singular', () => {
		const one: SafetyViolation[] = [
			{
				severity: 'warning',
				index: 4,
				message: 'Waypoint 4 is inside controlled airspace: ATL.',
				group: { key: 'airspace:controlled:ATL', noun: 'inside controlled airspace: ATL' }
			}
		];
		expect(formatViolations(one)).toBe('⚠ Waypoint 4 inside controlled airspace: ATL.');
	});

	it('leaves ungrouped violations untouched', () => {
		const mixed: SafetyViolation[] = [
			{ severity: 'error', index: 2, message: 'Waypoint 2 altitude 200 m exceeds the 120 m ceiling.' }
		];
		expect(formatViolations(mixed)).toBe('⛔ Waypoint 2 altitude 200 m exceeds the 120 m ceiling.');
	});
});

describe('validateTakeoff', () => {
	const point = { lat: 33.75, lon: -84.39 };

	it('blocks a takeoff inside restricted airspace', () => {
		const tfr: AirspaceZone = { ...zone, name: 'TFR 6/1', restricted: true, type: 'TFR' };
		const violations = validateTakeoff(point, 50, DEFAULT_SAFETY_LIMITS, [tfr]);
		expect(violations).toHaveLength(1);
		expect(violations[0].severity).toBe('error');
		expect(violations[0].message).toContain('TFR 6/1');
	});

	it('warns for a takeoff inside controlled airspace', () => {
		const violations = validateTakeoff(point, 50, DEFAULT_SAFETY_LIMITS, [zone]);
		expect(violations).toHaveLength(1);
		expect(violations[0].severity).toBe('warning');
		expect(violations[0].message).toContain('TEST CLASS E');
	});

	it('ignores a zone whose floor is above the target altitude', () => {
		const shelf: AirspaceZone = { ...zone, lowerM: 213 };
		expect(validateTakeoff(point, 50, DEFAULT_SAFETY_LIMITS, [shelf])).toEqual([]);
	});

	it('blocks a takeoff altitude above the safety ceiling', () => {
		const violations = validateTakeoff(point, 200, DEFAULT_SAFETY_LIMITS, []);
		expect(violations).toHaveLength(1);
		expect(violations[0].severity).toBe('error');
	});

	it('warns above the LAANC ceiling at the takeoff point', () => {
		const hazards = {
			ceilings: [{ ceilingFt: 100, airport: 'ATL', laanc: true, polygon: zone.polygon }],
			obstacles: []
		};
		const violations = validateTakeoff(point, 50, DEFAULT_SAFETY_LIMITS, [], hazards);
		expect(violations).toHaveLength(1);
		expect(violations[0].severity).toBe('warning');
		expect(violations[0].message).toContain('ATL');
	});

	it('passes a clear takeoff', () => {
		const away = { lat: 34.5, lon: -85.0 };
		expect(validateTakeoff(away, 50, DEFAULT_SAFETY_LIMITS, [zone])).toEqual([]);
	});
});

describe('overridable marking', () => {
	const point = { lat: 33.75, lon: -84.39 };
	const restricted: AirspaceZone = { ...zone, name: 'TFR 6/1', restricted: true, type: 'TFR' };

	it('marks a restricted-airspace takeoff error as overridable', () => {
		const violations = validateTakeoff(point, 50, DEFAULT_SAFETY_LIMITS, [restricted]);
		expect(violations[0].overridable).toBe(true);
	});

	it('marks a restricted-airspace waypoint error as overridable', () => {
		const actions: MissionPlanActions = { 1: waypoint() };
		const violations = validateMission(actions, DEFAULT_SAFETY_LIMITS, [restricted]);
		const inside = violations.find((v) => v.message.includes('TFR 6/1'));
		expect(inside?.overridable).toBe(true);
	});

	it('leaves an altitude error without the override', () => {
		const violations = validateTakeoff(point, 200, DEFAULT_SAFETY_LIMITS, []);
		expect(violations[0].overridable).toBeUndefined();
	});
});
