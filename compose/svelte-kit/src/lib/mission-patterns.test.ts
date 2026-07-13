import { describe, expect, it } from 'vitest';
import { orbit, surveyGrid, corridor, sarExpandingSquare, structureScan } from './mission-patterns';
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

describe('corridor', () => {
	const path = [
		{ lat: 33.75, lon: -84.39 },
		{ lat: 33.75, lon: -84.388 }
	];

	it('lays parallel serpentine lanes across the width', () => {
		const wps = corridor({ path, widthM: 40, spacingM: 20, altM: 30 });
		// width 40 / spacing 20 => 3 lanes, each with the 2 path points.
		expect(wps).toHaveLength(6);
		expect(wps.every((w) => w.alt === 30)).toBe(true);
		// Lanes straddle the path in latitude (offset perpendicular to an
		// east-west path is north-south).
		const lats = wps.map((w) => w.lat);
		expect(Math.max(...lats)).toBeGreaterThan(path[0].lat);
		expect(Math.min(...lats)).toBeLessThan(path[0].lat);
	});

	it('is a single centered lane when the width is zero', () => {
		const wps = corridor({ path, widthM: 0, spacingM: 20, altM: 30 });
		expect(wps).toHaveLength(2);
		expect(wps[0].lat).toBeCloseTo(path[0].lat, 6);
	});

	it('rejects a path shorter than two points', () => {
		expect(corridor({ path: path.slice(0, 1), widthM: 40, spacingM: 20, altM: 30 })).toEqual([]);
	});
});

describe('sarExpandingSquare', () => {
	const center = { lat: 33.75, lon: -84.39 };

	it('grows the leg length every two turns', () => {
		const wps = sarExpandingSquare({ center, spacingM: 25, legs: 6, altM: 40, clockwise: false });
		expect(wps).toHaveLength(7);
		// First leg ~25 m, third leg ~50 m (legs 1,2 = 25; legs 3,4 = 50).
		const leg1 = haversineMeters({ lat: wps[0].lat, lon: wps[0].lon }, { lat: wps[1].lat, lon: wps[1].lon });
		const leg3 = haversineMeters({ lat: wps[2].lat, lon: wps[2].lon }, { lat: wps[3].lat, lon: wps[3].lon });
		expect(leg1).toBeCloseTo(25, 0);
		expect(leg3).toBeCloseTo(50, 0);
	});

	it('rejects degenerate input', () => {
		expect(sarExpandingSquare({ center, spacingM: 0, legs: 6, altM: 40, clockwise: true })).toEqual([]);
	});
});

describe('structureScan', () => {
	const center = { lat: 33.75, lon: -84.39 };

	it('stacks orbit rings at rising altitudes', () => {
		const wps = structureScan({ center, radiusM: 30, points: 6, baseAltM: 20, layers: 3, layerHeightM: 5, clockwise: true });
		// 3 layers x (6 + 1 closing) points.
		expect(wps).toHaveLength(21);
		const alts = [...new Set(wps.map((w) => w.alt))];
		expect(alts).toEqual([20, 25, 30]);
		for (const w of wps) {
			expect(haversineMeters(center, { lat: w.lat, lon: w.lon })).toBeCloseTo(30, 0);
		}
	});

	it('rejects degenerate input', () => {
		expect(structureScan({ center, radiusM: 0, points: 6, baseAltM: 20, layers: 3, layerHeightM: 5, clockwise: true })).toEqual([]);
	});
});
