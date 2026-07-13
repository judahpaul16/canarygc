import { describe, expect, it } from 'vitest';
import { PARAM_GROUPS, helpFor, paramInGroup, prefixesFor } from './param-groups';

const failsafe = PARAM_GROUPS.find((g) => g.key === 'failsafe')!;
const logging = PARAM_GROUPS.find((g) => g.key === 'logging')!;

describe('prefixesFor', () => {
	it('returns the ArduPilot prefixes for an ArduPilot model', () => {
		expect(prefixesFor(logging, 'ArduPilot')).toContain('LOG_');
	});

	it('returns the PX4 prefixes for a PX4 model', () => {
		expect(prefixesFor(logging, 'PX4')).toContain('SDLOG_');
		expect(prefixesFor(logging, 'PX4')).not.toContain('LOG_');
	});
});

describe('paramInGroup', () => {
	it('matches ArduPilot failsafe parameters', () => {
		expect(paramInGroup('FS_THR_ENABLE', failsafe, 'ArduPilot')).toBe(true);
		expect(paramInGroup('BATT_FS_LOW_ACT', failsafe, 'ArduPilot')).toBe(true);
		expect(paramInGroup('ATC_RAT_RLL_P', failsafe, 'ArduPilot')).toBe(false);
	});

	it('matches PX4 failsafe parameters and ignores ArduPilot names', () => {
		expect(paramInGroup('NAV_RCL_ACT', failsafe, 'PX4')).toBe(true);
		expect(paramInGroup('FS_THR_ENABLE', failsafe, 'PX4')).toBe(false);
	});

	it('strips surrounding quotes and is case-insensitive', () => {
		expect(paramInGroup('"log_bitmask"', logging, 'ArduPilot')).toBe(true);
	});
});

describe('helpFor', () => {
	it('returns curated help for a known parameter', () => {
		expect(helpFor('FS_THR_ENABLE')).toMatch(/RC link is lost/i);
	});

	it('returns undefined for an unknown parameter', () => {
		expect(helpFor('ATC_RAT_RLL_P')).toBeUndefined();
	});
});
