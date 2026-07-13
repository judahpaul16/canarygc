import { describe, expect, it } from 'vitest';
import {
	buildTuningPrompt,
	collectPidParams,
	isPidParam,
	parseTuningResponse,
	pidPrefixes
} from './pid-tuning';
import type { Parameter } from '../stores/mavlinkStore';

function param(id: string, value: number): Parameter {
	return { param_id: id, param_value: value, param_type: 9, param_count: 0, param_index: 0 };
}

describe('pidPrefixes / isPidParam', () => {
	it('selects ArduPilot rate and angle gains', () => {
		expect(pidPrefixes('ArduPilot')).toContain('ATC_RAT_');
		expect(isPidParam('ATC_RAT_RLL_P', 'ArduPilot')).toBe(true);
		expect(isPidParam('ATC_ANG_PIT_P', 'ArduPilot')).toBe(true);
		expect(isPidParam('FS_THR_ENABLE', 'ArduPilot')).toBe(false);
	});

	it('selects PX4 multicopter gains', () => {
		expect(isPidParam('MC_ROLLRATE_P', 'PX4')).toBe(true);
		expect(isPidParam('MC_YAW_P', 'PX4')).toBe(true);
		expect(isPidParam('ATC_RAT_RLL_P', 'PX4')).toBe(false);
	});
});

describe('collectPidParams', () => {
	it('keeps only PID parameters and strips quotes', () => {
		const params = [param('"ATC_RAT_RLL_P"', 0.135), param('BATT_CAPACITY', 5000), param('ATC_ANG_RLL_P', 4.5)];
		const pids = collectPidParams(params, 'ArduPilot');
		expect(pids).toHaveLength(2);
		expect(pids[0]).toEqual({ param_id: 'ATC_RAT_RLL_P', value: 0.135 });
	});
});

describe('buildTuningPrompt', () => {
	it('names the autopilot and lists gains, vibration, and attitude', () => {
		const { system, user } = buildTuningPrompt({
			model: 'PX4',
			pids: [{ param_id: 'MC_ROLLRATE_P', value: 0.15 }],
			vibration: { x: 12, y: 14, z: 40, clip0: 0, clip1: 0, clip2: 3 },
			attitude: { rollDeg: 2, pitchDeg: -1 }
		});
		expect(system).toContain('PX4');
		expect(user).toContain('MC_ROLLRATE_P = 0.15');
		expect(user).toContain('Vibration');
		expect(user).toContain('roll 2.0 deg');
	});

	it('notes when vibration telemetry is missing', () => {
		const { user } = buildTuningPrompt({
			model: 'ArduPilot',
			pids: [{ param_id: 'ATC_RAT_RLL_P', value: 0.135 }],
			vibration: null
		});
		expect(user).toContain('Vibration telemetry is unavailable');
	});
});

describe('parseTuningResponse', () => {
	it('extracts JSON from a fenced reply and validates recommendations', () => {
		const reply =
			'Here is the tune:\n```json\n{"summary":"Lower roll D to cut buzz","recommendations":[{"param_id":"ATC_RAT_RLL_D","current":0.004,"suggested":0.003,"reason":"High Z vibration"}]}\n```';
		const result = parseTuningResponse(reply);
		expect(result.summary).toMatch(/Lower roll D/);
		expect(result.recommendations).toHaveLength(1);
		expect(result.recommendations[0].suggested).toBe(0.003);
	});

	it('drops recommendations that lack a param id or a numeric target', () => {
		const reply =
			'{"summary":"","recommendations":[{"param_id":"","suggested":1},{"param_id":"MC_ROLLRATE_P","suggested":"bad"},{"param_id":"MC_YAWRATE_P","current":0.2,"suggested":0.18,"reason":"x"}]}';
		const result = parseTuningResponse(reply);
		expect(result.recommendations).toHaveLength(1);
		expect(result.recommendations[0].param_id).toBe('MC_YAWRATE_P');
	});

	it('throws when there is no JSON object', () => {
		expect(() => parseTuningResponse('no json here')).toThrow();
	});
});
