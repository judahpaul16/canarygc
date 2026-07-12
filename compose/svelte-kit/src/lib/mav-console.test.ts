import { describe, expect, it } from 'vitest';
import { commandCatalog, paramHint, parseConsoleInput } from './mav-console';

describe('commandCatalog', () => {
	it('carries the ArduPilot dialect only off PX4', () => {
		const ardu = commandCatalog('ArduPilot');
		const px4 = commandCatalog('PX4');
		expect(ardu.some((c) => c.ardu)).toBe(true);
		expect(px4.some((c) => c.ardu)).toBe(false);
		expect(px4.every((c) => ardu.some((a) => a.name === c.name))).toBe(true);
	});
});

describe('parseConsoleInput', () => {
	it('accepts a command with params, stripping the MAV_CMD_ prefix', () => {
		const parsed = parseConsoleInput('mav_cmd_nav_takeoff 0 0 0 NaN NaN NaN 10', 'PX4');
		expect(parsed.ok).toBe(true);
		expect(parsed.name).toBe('NAV_TAKEOFF');
		expect(parsed.params).toHaveLength(7);
		expect(parsed.params?.[3]).toBeNaN();
		expect(parsed.params?.[6]).toBe(10);
	});

	it('rejects empty input, unknown commands, junk tokens, and too many params', () => {
		expect(parseConsoleInput('   ', 'PX4').ok).toBe(false);
		expect(parseConsoleInput('NAV_NOT_A_THING 1', 'PX4').ok).toBe(false);
		expect(parseConsoleInput('NAV_TAKEOFF banana', 'PX4').error).toContain('banana');
		expect(parseConsoleInput('NAV_TAKEOFF 1 2 3 4 5 6 7 8', 'PX4').ok).toBe(false);
	});

	it('rejects ArduPilot dialect commands while PX4 is connected', () => {
		const arduOnly = commandCatalog('ArduPilot').find((c) => c.ardu);
		expect(arduOnly).toBeDefined();
		expect(parseConsoleInput(arduOnly!.name, 'PX4').ok).toBe(false);
		expect(parseConsoleInput(arduOnly!.name, 'ArduPilot').ok).toBe(true);
	});
});

describe('paramHint', () => {
	it('describes known commands and falls back generically', () => {
		expect(paramHint('NAV_TAKEOFF')).toContain('alt m');
		expect(paramHint('NAV_RETURN_TO_LAUNCH')).toBe('no parameters');
		expect(paramHint('SOMETHING_ELSE')).toContain('param1');
	});
});
