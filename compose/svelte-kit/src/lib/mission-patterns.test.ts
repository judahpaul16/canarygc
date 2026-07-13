import { describe, expect, it } from 'vitest';
import { orbit, surveyGrid } from './mission-patterns';
import { haversineMeters } from './geo';

// 200 m x 100 m rectangle near Atlanta: 200 m east-west, 100 m north-south.
const rect = [
	{ lat: 33.75, lon: -84.39 },
	{ lat: 33.75, lon: -84.38784 },
	{ lat: 33.7509, lon: -84.38784 },
	{ lat: 33.7509, lon: -84.39 }
];

describe('surveyGrid', () => {
	it('lays serpentine transects across the polygon at the requested spacing', () => {
		const wps = surveyGrid({ polygon: rect, spacingM: 25, angleDeg: 90, altM: 40 });
		expect(wps.length).toBeGreaterThanOrEqual(8);
		expect(wps.length % 2).toBe(0);
		expect(wps.every((w) => w.alt === 40)).toBe(true);

		// Consecutive transects sit ~spacing apart along the normal (north).
		const firstLineLat = wps[0].lat;
		const secondLineLat = wps[2].lat;
		const step = haversineMeters(
			{ lat: firstLineLat, lon: wps[0].lon },
			{ lat: secondLineLat, lon: wps[0].lon }
		);
		expect(step).toBeGreaterThan(20);
		expect(step).toBeLessThan(30);

		// Serpentine: the second transect starts where the first ended (same
		// side), so consecutive rows alternate direction.
		expect(Math.abs(wps[1].lon - wps[2].lon)).toBeLessThan(Math.abs(wps[1].lon - wps[3].lon));
	});

	it('keeps every waypoint inside the polygon bounds', () => {
		const wps = surveyGrid({ polygon: rect, spacingM: 20, angleDeg: 90, altM: 30 });
		const lats = rect.map((p) => p.lat);
		const lons = rect.map((p) => p.lon);
		for (const w of wps) {
			expect(w.lat).toBeGreaterThanOrEqual(Math.min(...lats) - 1e-9);
			expect(w.lat).toBeLessThanOrEqual(Math.max(...lats) + 1e-9);
			expect(w.lon).toBeGreaterThanOrEqual(Math.min(...lons) - 1e-9);
			expect(w.lon).toBeLessThanOrEqual(Math.max(...lons) + 1e-9);
		}
	});

	it('rejects degenerate input', () => {
		expect(surveyGrid({ polygon: rect.slice(0, 2), spacingM: 20, angleDeg: 0, altM: 30 })).toEqual(
			[]
		);
		expect(surveyGrid({ polygon: rect, spacingM: 0, angleDeg: 0, altM: 30 })).toEqual([]);
	});

	it('caps the transect count', () => {
		const wps = surveyGrid({ polygon: rect, spacingM: 1, angleDeg: 90, altM: 30 });
		expect(wps.length).toBeLessThanOrEqual(400);
	});
});

describe('orbit', () => {
	const center = { lat: 33.75, lon: -84.39 };

	it('rings the center at the requested radius and closes the loop', () => {
		const wps = orbit({ center, radiusM: 50, points: 8, altM: 25, clockwise: true });
		expect(wps).toHaveLength(9);
		expect(wps[0]).toEqual(wps[8]);
		for (const w of wps) {
			expect(haversineMeters(center, { lat: w.lat, lon: w.lon })).toBeCloseTo(50, 0);
			expect(w.alt).toBe(25);
		}
	});

	it('honors direction', () => {
		const cw = orbit({ center, radiusM: 50, points: 8, altM: 25, clockwise: true });
		const ccw = orbit({ center, radiusM: 50, points: 8, altM: 25, clockwise: false });
		// First step heads east when clockwise, west when counterclockwise.
		expect(cw[1].lon).toBeGreaterThan(center.lon);
		expect(ccw[1].lon).toBeLessThan(center.lon);
	});

	it('rejects degenerate input', () => {
		expect(orbit({ center, radiusM: 0, points: 8, altM: 25, clockwise: true })).toEqual([]);
		expect(orbit({ center, radiusM: 50, points: 2, altM: 25, clockwise: true })).toEqual([]);
	});
});
