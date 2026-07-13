// Mission pattern generators, modeled on QGroundControl's Survey and Orbit
// patterns: a survey lays serpentine transects across a polygon at a grid
// angle relative to north; an orbit rings a center point. Pure math over a
// local east-north plane so the planner and tests share one implementation.
import type { LatLon } from './geo';

export interface SurveyParams {
	polygon: LatLon[];
	spacingM: number;
	angleDeg: number;
	altM: number;
}

export interface OrbitParams {
	center: LatLon;
	radiusM: number;
	points: number;
	altM: number;
	clockwise: boolean;
}

export interface PatternPoint {
	lat: number;
	lon: number;
	alt: number;
}

const M_PER_DEG_LAT = 111320;
// A runaway spacing/area combination stops at a sane mission size instead of
// generating thousands of waypoints.
const MAX_TRANSECTS = 200;

type Vec = { x: number; y: number };

function toLocal(origin: LatLon, p: LatLon): Vec {
	const lonScale = Math.cos((origin.lat * Math.PI) / 180) * M_PER_DEG_LAT;
	return { x: (p.lon - origin.lon) * lonScale, y: (p.lat - origin.lat) * M_PER_DEG_LAT };
}

function toLatLon(origin: LatLon, v: Vec): LatLon {
	const lonScale = Math.cos((origin.lat * Math.PI) / 180) * M_PER_DEG_LAT;
	return { lat: origin.lat + v.y / M_PER_DEG_LAT, lon: origin.lon + v.x / lonScale };
}

// Serpentine transects: project the polygon onto the normal of the transect
// direction, walk lines across that span at the requested spacing, and take
// each line's outer entry and exit through the polygon.
export function surveyGrid({ polygon, spacingM, angleDeg, altM }: SurveyParams): PatternPoint[] {
	if (polygon.length < 3 || !(spacingM >= 1)) return [];
	const origin = polygon[0];
	const pts = polygon.map((p) => toLocal(origin, p));

	const theta = (angleDeg * Math.PI) / 180;
	// Transects head along `dir` (bearing angleDeg from north); lines stack
	// along the normal.
	const dir: Vec = { x: Math.sin(theta), y: Math.cos(theta) };
	const normal: Vec = { x: dir.y, y: -dir.x };

	const along = (p: Vec) => p.x * dir.x + p.y * dir.y;
	const across = (p: Vec) => p.x * normal.x + p.y * normal.y;

	const acrossValues = pts.map(across);
	const minAcross = Math.min(...acrossValues);
	const maxAcross = Math.max(...acrossValues);
	const span = maxAcross - minAcross;
	if (!(span > 0)) return [];

	const transectCount = Math.min(MAX_TRANSECTS, Math.max(1, Math.floor(span / spacingM) + 1));
	const offset = (span - (transectCount - 1) * spacingM) / 2;

	const waypoints: PatternPoint[] = [];
	for (let i = 0; i < transectCount; i++) {
		const c = minAcross + offset + i * spacingM;
		// Intersections of the polygon's edges with the line across(p) = c.
		const hits: number[] = [];
		for (let e = 0; e < pts.length; e++) {
			const a = pts[e];
			const b = pts[(e + 1) % pts.length];
			const da = across(a) - c;
			const db = across(b) - c;
			if ((da > 0 && db > 0) || (da < 0 && db < 0)) continue;
			if (da === db) continue;
			const t = da / (da - db);
			hits.push(along(a) + t * (along(b) - along(a)));
		}
		if (hits.length < 2) continue;
		const entry = Math.min(...hits);
		const exit = Math.max(...hits);
		const pair: Vec[] = [
			{ x: normal.x * c + dir.x * entry, y: normal.y * c + dir.y * entry },
			{ x: normal.x * c + dir.x * exit, y: normal.y * c + dir.y * exit }
		];
		if (i % 2 === 1) pair.reverse();
		for (const v of pair) {
			const ll = toLatLon(origin, v);
			waypoints.push({ lat: ll.lat, lon: ll.lon, alt: altM });
		}
	}
	return waypoints;
}

// Waypoints evenly spaced around the circle, starting north of the center and
// closing back on the first point so the vehicle completes the ring.
export function orbit({ center, radiusM, points, altM, clockwise }: OrbitParams): PatternPoint[] {
	if (!(radiusM > 0) || !Number.isFinite(points) || points < 3) return [];
	const count = Math.min(72, Math.round(points));
	const waypoints: PatternPoint[] = [];
	for (let i = 0; i <= count; i++) {
		const step = ((i % count) / count) * 2 * Math.PI;
		const bearing = clockwise ? step : -step;
		const v: Vec = { x: Math.sin(bearing) * radiusM, y: Math.cos(bearing) * radiusM };
		const ll = toLatLon(center, v);
		waypoints.push({ lat: ll.lat, lon: ll.lon, alt: altM });
	}
	return waypoints;
}
