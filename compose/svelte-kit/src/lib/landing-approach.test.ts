import { describe, expect, it } from 'vitest';
import { pickApproach, APPROACH_ALT_M, APPROACH_DISTANCE_M } from './landing-approach';
import { bearingDegrees, destinationPoint, haversineMeters, type LatLon } from './geo';
import type { AirspaceZone } from './safety';
import type { Obstacle } from './hazards';

const HOME: LatLon = { lat: 33.79, lon: -84.37 };
const VEHICLE: LatLon = { lat: 33.8, lon: -84.36 }; // northeast of home

const flatTerrain = async (points: LatLon[]) => points.map(() => 300);
const noTerrain = async () => null;

const obstacleAt = (p: LatLon, aglFt: number): Obstacle => ({
	lat: p.lat,
	lon: p.lon,
	type: 'Tower',
	aglFt,
	amslFt: aglFt
});

// A square zone centered on a point, roughly sideM meters across.
function zoneAround(center: LatLon, sideM: number, restricted: boolean, name = 'Zone'): AirspaceZone {
	const d = sideM / 2 / 111_320;
	const ring = [
		[center.lon - d, center.lat - d],
		[center.lon + d, center.lat - d],
		[center.lon + d, center.lat + d],
		[center.lon - d, center.lat + d],
		[center.lon - d, center.lat - d]
	];
	return { name, restricted, polygon: [ring] };
}

describe('pickApproach', () => {
	it('flies straight in from the vehicle side when the corridor is clear', async () => {
		const pick = await pickApproach(HOME, VEHICLE, [], [], [], 120, flatTerrain);
		expect(pick.clear).toBe(true);
		expect(pick.altM).toBe(APPROACH_ALT_M);
		expect(pick.distanceM).toBe(APPROACH_DISTANCE_M);
		expect(pick.bearingDeg).toBeCloseTo(bearingDegrees(HOME, VEHICLE), 0);
		expect(haversineMeters(HOME, pick.approach)).toBeCloseTo(APPROACH_DISTANCE_M, -1);
		expect(pick.warnings).toEqual([]);
	});

	it('rotates the corridor off a tower sitting on the default final', async () => {
		const baseBearing = bearingDegrees(HOME, VEHICLE);
		const onFinal = destinationPoint(HOME, baseBearing, 400);
		const pick = await pickApproach(HOME, VEHICLE, [], [obstacleAt(onFinal, 300)], [], 120, flatTerrain);
		expect(pick.clear).toBe(true);
		const rotation = Math.abs(((pick.bearingDeg - baseBearing + 540) % 360) - 180);
		expect(rotation).toBeLessThan(180);
		expect(pick.bearingDeg).not.toBeCloseTo(baseBearing, 0);
	});

	it('raises and lengthens the approach over a tower on the inbound leg', async () => {
		// Tall enough to force a climb on every inbound corridor, short enough
		// that the glide from farther out clears it on final.
		const nearVehicle = destinationPoint(HOME, bearingDegrees(HOME, VEHICLE), 1300);
		const pick = await pickApproach(HOME, VEHICLE, [], [obstacleAt(nearVehicle, 262)], [], 120, flatTerrain);
		expect(pick.clear).toBe(true);
		expect(pick.altM).toBeGreaterThan(APPROACH_ALT_M);
		expect(pick.distanceM).toBe(pick.altM * 12);
	});

	it('rejects corridors through rising terrain on final', async () => {
		const baseBearing = bearingDegrees(HOME, VEHICLE);
		// Ground climbs 45 m on the vehicle's side of home; flat elsewhere.
		const ridgeTerrain = async (points: LatLon[]) =>
			points.map((p) => (p.lat > HOME.lat + 0.002 ? 345 : 300));
		const pick = await pickApproach(HOME, VEHICLE, [], [], [], 120, ridgeTerrain);
		expect(pick.clear).toBe(true);
		expect(pick.bearingDeg).not.toBeCloseTo(baseBearing, 0);
	});

	it('never routes a corridor through restricted airspace', async () => {
		const baseBearing = bearingDegrees(HOME, VEHICLE);
		const onFinal = destinationPoint(HOME, baseBearing, 400);
		const zones = [zoneAround(onFinal, 400, true, 'R-0000')];
		const pick = await pickApproach(HOME, VEHICLE, zones, [], [], 120, flatTerrain);
		expect(pick.clear).toBe(true);
		expect(pick.bearingDeg).not.toBeCloseTo(baseBearing, 0);
	});

	it('warns about controlled airspace instead of refusing to land', async () => {
		const zones = [zoneAround(HOME, 6000, false, 'ATLANTA CLASS E')];
		const pick = await pickApproach(HOME, VEHICLE, zones, [], [], 120, flatTerrain);
		expect(pick.clear).toBe(true);
		expect(pick.warnings.some((w) => w.includes('ATLANTA CLASS E'))).toBe(true);
	});

	it('falls back to the direct approach with a warning when everything is blocked', async () => {
		const zones = [zoneAround(HOME, 8000, true, 'R-EVERYWHERE')];
		const pick = await pickApproach(HOME, VEHICLE, zones, [], [], 120, flatTerrain);
		expect(pick.clear).toBe(false);
		expect(pick.bearingDeg).toBeCloseTo(bearingDegrees(HOME, VEHICLE), 0);
		expect(pick.warnings.some((w) => w.includes('Every approach corridor'))).toBe(true);
	});

	it('says so when terrain data is unavailable', async () => {
		const pick = await pickApproach(HOME, VEHICLE, [], [], [], 120, noTerrain);
		expect(pick.clear).toBe(true);
		expect(pick.warnings.some((w) => w.includes('Terrain data is unavailable'))).toBe(true);
	});
});
