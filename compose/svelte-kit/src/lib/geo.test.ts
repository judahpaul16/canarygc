import { describe, expect, it } from 'vitest';
import {
	bearingDegrees,
	haversineMeters,
	pathLengthMeters,
	pointInPolygon,
	segmentIntersectsPolygon,
	segmentsIntersect
} from './geo';

const atlanta = { lat: 33.749, lon: -84.388 };
const decatur = { lat: 33.7748, lon: -84.2963 };

// A 0.02 degree square around Atlanta with a 0.004 degree hole in the middle.
const square: number[][][] = [
	[
		[-84.398, 33.739],
		[-84.378, 33.739],
		[-84.378, 33.759],
		[-84.398, 33.759],
		[-84.398, 33.739]
	],
	[
		[-84.39, 33.747],
		[-84.386, 33.747],
		[-84.386, 33.751],
		[-84.39, 33.751],
		[-84.39, 33.747]
	]
];

describe('distances and bearings', () => {
	it('measures Atlanta to Decatur within tolerance', () => {
		const d = haversineMeters(atlanta, decatur);
		expect(d).toBeGreaterThan(8000);
		expect(d).toBeLessThan(10000);
	});

	it('bears roughly east from Atlanta to Decatur', () => {
		const b = bearingDegrees(atlanta, decatur);
		expect(b).toBeGreaterThan(60);
		expect(b).toBeLessThan(90);
	});

	it('sums a path', () => {
		const total = pathLengthMeters([atlanta, decatur, atlanta]);
		expect(total).toBeCloseTo(2 * haversineMeters(atlanta, decatur), 6);
	});
});

describe('polygon containment with holes', () => {
	it('contains a point in the ring but not in the hole or outside', () => {
		expect(pointInPolygon({ lat: 33.755, lon: -84.395 }, square)).toBe(true);
		expect(pointInPolygon({ lat: 33.749, lon: -84.388 }, square)).toBe(false);
		expect(pointInPolygon({ lat: 33.8, lon: -84.388 }, square)).toBe(false);
	});
});

describe('segment intersection', () => {
	it('detects crossing and non-crossing segments', () => {
		expect(
			segmentsIntersect(
				{ lat: 0, lon: 0 },
				{ lat: 1, lon: 1 },
				{ lat: 0, lon: 1 },
				{ lat: 1, lon: 0 }
			)
		).toBe(true);
		expect(
			segmentsIntersect(
				{ lat: 0, lon: 0 },
				{ lat: 0, lon: 1 },
				{ lat: 1, lon: 0 },
				{ lat: 1, lon: 1 }
			)
		).toBe(false);
	});

	it('detects a leg cutting through a polygon', () => {
		expect(
			segmentIntersectsPolygon({ lat: 33.749, lon: -84.42 }, { lat: 33.749, lon: -84.36 }, square)
		).toBe(true);
		expect(
			segmentIntersectsPolygon({ lat: 33.8, lon: -84.42 }, { lat: 33.8, lon: -84.36 }, square)
		).toBe(false);
	});
});
