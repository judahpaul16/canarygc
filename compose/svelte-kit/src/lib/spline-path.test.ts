import { describe, expect, it } from 'vitest';
import { missionSegmentPaths, stopsAt, type PathNode } from './spline-path';

const node = (lat: number, lng: number, spline = false, stop = false): PathNode => ({
	lat,
	lng,
	spline,
	stop
});

const mixed = [
	node(0, 0, false, true),
	node(0.001, 0.001, true),
	node(0.002, 0, true),
	node(0.003, 0.001)
];

describe('missionSegmentPaths', () => {
	it('samples spline legs and keeps straight legs as two points', () => {
		const segments = missionSegmentPaths(mixed, true);
		expect(segments).toHaveLength(3);
		expect(segments[0].length).toBeGreaterThan(2);
		expect(segments[1].length).toBeGreaterThan(2);
		expect(segments[2]).toHaveLength(2);
	});

	it('hits every segment endpoint exactly', () => {
		const segments = missionSegmentPaths(mixed, true);
		segments.forEach((path, i) => {
			expect(path[0].lat).toBeCloseTo(mixed[i].lat, 9);
			expect(path[0].lng).toBeCloseTo(mixed[i].lng, 9);
			expect(path[path.length - 1].lat).toBeCloseTo(mixed[i + 1].lat, 9);
			expect(path[path.length - 1].lng).toBeCloseTo(mixed[i + 1].lng, 9);
		});
	});

	it('curves a spline leg off the straight chord', () => {
		const [first] = missionSegmentPaths(mixed, true);
		const mid = first[Math.floor(first.length / 2)];
		const chordMid = {
			lat: (mixed[0].lat + mixed[1].lat) / 2,
			lng: (mixed[0].lng + mixed[1].lng) / 2
		};
		const off = Math.hypot(mid.lat - chordMid.lat, mid.lng - chordMid.lng);
		expect(off).toBeGreaterThan(1e-6);
	});

	it('draws every leg straight when curves are off (PX4 substitution)', () => {
		const segments = missionSegmentPaths(mixed, false);
		expect(segments).toHaveLength(3);
		for (const path of segments) expect(path).toHaveLength(2);
	});

	it('returns nothing for fewer than two nodes', () => {
		expect(missionSegmentPaths([], true)).toHaveLength(0);
		expect(missionSegmentPaths([node(1, 1)], true)).toHaveLength(0);
	});
});

describe('stopsAt', () => {
	it('stops at stopping command types', () => {
		expect(stopsAt('NAV_TAKEOFF', null)).toBe(true);
		expect(stopsAt('NAV_LAND', null)).toBe(true);
		expect(stopsAt('NAV_LOITER_TIME', null)).toBe(true);
		expect(stopsAt('NAV_RETURN_TO_LAUNCH', null)).toBe(true);
	});

	it('stops at waypoints holding via param1 and flies through otherwise', () => {
		expect(stopsAt('NAV_WAYPOINT', 5)).toBe(true);
		expect(stopsAt('NAV_SPLINE_WAYPOINT', '3')).toBe(true);
		expect(stopsAt('NAV_WAYPOINT', 0)).toBe(false);
		expect(stopsAt('NAV_WAYPOINT', null)).toBe(false);
		expect(stopsAt('NAV_SPLINE_WAYPOINT', undefined)).toBe(false);
	});
});
