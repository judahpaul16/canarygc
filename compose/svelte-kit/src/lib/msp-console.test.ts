import { describe, expect, it } from 'vitest';
import { mspCommandCatalog, mspParamHint, parseMspConsoleInput, describeMspResponse } from './msp-console';
import { MSP } from './msp';

describe('mspCommandCatalog', () => {
	it('lists known MSP commands including reads and writes', () => {
		const names = mspCommandCatalog().map((c) => c.name);
		expect(names).toContain('MSP_STATUS');
		expect(names).toContain('MSP_RAW_GPS');
		expect(names).toContain('MSP_REBOOT');
		expect(mspCommandCatalog().find((c) => c.name === 'MSP_REBOOT')?.write).toBe(true);
	});

	it('gives a hint per command', () => {
		expect(mspParamHint('MSP_STATUS')).toMatch(/armed/i);
		expect(mspParamHint('MSP_UNKNOWN')).toMatch(/byte/i);
	});
});

describe('parseMspConsoleInput', () => {
	it('resolves a command with or without the MSP_ prefix', () => {
		expect(parseMspConsoleInput('MSP_STATUS')).toMatchObject({ ok: true, name: 'MSP_STATUS', code: MSP.STATUS });
		expect(parseMspConsoleInput('status')).toMatchObject({ ok: true, name: 'MSP_STATUS', code: MSP.STATUS });
	});

	it('parses trailing byte payload values', () => {
		const parsed = parseMspConsoleInput('MSP_SET_MODE_RANGE 0 0 4 25 30');
		expect(parsed.ok).toBe(true);
		expect(parsed.payload).toEqual([0, 0, 4, 25, 30]);
		expect(parsed.write).toBe(true);
	});

	it('rejects unknown commands, out-of-range bytes, and empty input', () => {
		expect(parseMspConsoleInput('MSP_NOPE').ok).toBe(false);
		expect(parseMspConsoleInput('MSP_STATUS 300').ok).toBe(false);
		expect(parseMspConsoleInput('   ').ok).toBe(false);
	});
});

describe('describeMspResponse', () => {
	it('decodes a known response', () => {
		expect(describeMspResponse(MSP.API_VERSION, [0, 1, 46])).toContain('"major":1');
		expect(describeMspResponse(MSP.STATUS, [0, 0, 0, 0, 0, 0, 1, 0, 0, 0])).toContain('"armed":true');
	});

	it('falls back to hex for an unknown response and reports empty payloads', () => {
		expect(describeMspResponse(9999, [0xde, 0xad])).toBe('2 bytes: de ad');
		expect(describeMspResponse(MSP.REBOOT, [])).toBe('ok (no payload)');
	});
});
