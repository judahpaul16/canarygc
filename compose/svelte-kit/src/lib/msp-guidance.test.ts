import { describe, expect, it } from 'vitest';
import {
	computeGuidance,
	buildRcFrame,
	DEFAULT_GUIDANCE_CONFIG,
	DEFAULT_RC_CHANNELS,
	type GuidanceVehicle,
	type GuidancePoint
} from './msp-guidance';

const CENTER = DEFAULT_GUIDANCE_CONFIG.centerUs;
const atlanta: GuidancePoint = { lat: 33.75, lon: -84.39, altM: 30 };

function still(lat: number, lon: number, headingDeg: number): GuidanceVehicle {
	return { lat, lon, altM: 30, headingDeg, groundSpeedMs: 0, courseDeg: 0 };
}

describe('computeGuidance', () => {
	it('reports reached and centers the sticks at the target', () => {
		const out = computeGuidance(still(atlanta.lat, atlanta.lon, 0), atlanta);
		expect(out.reached).toBe(true);
		expect(out.sticks.roll).toBe(CENTER);
		expect(out.sticks.pitch).toBe(CENTER);
		expect(out.sticks.yaw).toBe(CENTER);
	});

	it('commands forward pitch below center for a target dead ahead', () => {
		// Target ~100 m north; vehicle heading north, at rest.
		const target: GuidancePoint = { lat: atlanta.lat + 0.0009, lon: atlanta.lon, altM: 30 };
		const out = computeGuidance(still(atlanta.lat, atlanta.lon, 0), target);
		expect(out.reached).toBe(false);
		expect(out.sticks.pitch).toBeLessThan(CENTER); // Betaflight: forward = pitch below center
		expect(Math.abs(out.sticks.roll - CENTER)).toBeLessThan(5);
	});

	it('banks right and yaws right for a target to the east', () => {
		// Target ~100 m east; vehicle heading north, at rest.
		const target: GuidancePoint = { lat: atlanta.lat, lon: atlanta.lon + 0.0011, altM: 30 };
		const out = computeGuidance(still(atlanta.lat, atlanta.lon, 0), target);
		expect(out.sticks.roll).toBeGreaterThan(CENTER);
		expect(out.sticks.yaw).toBeGreaterThan(CENTER); // bearing 90 deg to the right
	});

	it('clamps stick offsets to the configured horizontal limit', () => {
		const target: GuidancePoint = { lat: atlanta.lat + 0.05, lon: atlanta.lon + 0.05, altM: 30 };
		const out = computeGuidance(still(atlanta.lat, atlanta.lon, 0), target);
		const max = DEFAULT_GUIDANCE_CONFIG.maxHorizStickUs;
		expect(out.sticks.roll).toBeLessThanOrEqual(CENTER + max);
		expect(out.sticks.pitch).toBeGreaterThanOrEqual(CENTER - max);
	});
});

describe('buildRcFrame', () => {
	it('places sticks on AETR channels and arms the aux channel', () => {
		const frame = buildRcFrame({ roll: 1600, pitch: 1400, yaw: 1550 }, 1500, true);
		expect(frame.length).toBe(DEFAULT_RC_CHANNELS.channelCount);
		expect(frame[0]).toBe(1600); // roll
		expect(frame[1]).toBe(1400); // pitch
		expect(frame[2]).toBe(1500); // throttle
		expect(frame[3]).toBe(1550); // yaw
		expect(frame[4]).toBe(DEFAULT_RC_CHANNELS.armUs); // AUX1 arm
	});

	it('drops the arm channel low when disarmed', () => {
		const frame = buildRcFrame({ roll: 1500, pitch: 1500, yaw: 1500 }, 1000, false);
		expect(frame[4]).toBe(DEFAULT_RC_CHANNELS.disarmUs);
	});
});
