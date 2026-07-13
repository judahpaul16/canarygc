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

export interface CorridorParams {
	path: LatLon[];
	widthM: number;
	spacingM: number;
	altM: number;
}

export interface SarParams {
	center: LatLon;
	spacingM: number;
	legs: number;
	altM: number;
	clockwise: boolean;
}

export interface StructureScanParams {
	center: LatLon;
	radiusM: number;
	points: number;
	baseAltM: number;
	layers: number;
	layerHeightM: number;
	clockwise: boolean;
}

// Parallel lanes that follow a path, offset perpendicular across a width and
// walked serpentine, so the vehicle sweeps a strip along a road, shoreline, or
// pipeline.
export function corridor({ path, widthM, spacingM, altM }: CorridorParams): PatternPoint[] {
	if (path.length < 2 || !(spacingM >= 1) || !(widthM >= 0)) return [];
	const origin = path[0];
	const pts = path.map((p) => toLocal(origin, p));
	// The offset direction at each vertex is the normal of the averaged incoming
	// and outgoing segment direction, so lanes stay parallel around bends.
	const normals: Vec[] = pts.map((_, i) => {
		const prev = pts[Math.max(0, i - 1)];
		const next = pts[Math.min(pts.length - 1, i + 1)];
		const dx = next.x - prev.x;
		const dy = next.y - prev.y;
		const len = Math.hypot(dx, dy) || 1;
		return { x: dy / len, y: -dx / len };
	});
	const laneCount = Math.min(MAX_TRANSECTS, Math.max(1, Math.floor(widthM / spacingM) + 1));
	const start = laneCount === 1 ? 0 : -widthM / 2;
	const step = laneCount === 1 ? 0 : widthM / (laneCount - 1);
	const waypoints: PatternPoint[] = [];
	for (let l = 0; l < laneCount; l++) {
		const off = start + l * step;
		const lane = pts.map((p, i) => ({ x: p.x + normals[i].x * off, y: p.y + normals[i].y * off }));
		if (l % 2 === 1) lane.reverse();
		for (const v of lane) {
			const ll = toLatLon(origin, v);
			waypoints.push({ lat: ll.lat, lon: ll.lon, alt: altM });
		}
	}
	return waypoints;
}

// Expanding-square search from a datum: legs grow by the track spacing every two
// turns, the standard SAR pattern for sweeping outward from a last-known point.
export function sarExpandingSquare({ center, spacingM, legs, altM, clockwise }: SarParams): PatternPoint[] {
	if (!(spacingM >= 1) || !(legs >= 1)) return [];
	const n = Math.min(120, Math.round(legs));
	const dirs: Vec[] = clockwise
		? [{ x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }]
		: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
	let pos: Vec = { x: 0, y: 0 };
	const waypoints: PatternPoint[] = [];
	const push = (v: Vec) => {
		const ll = toLatLon(center, v);
		waypoints.push({ lat: ll.lat, lon: ll.lon, alt: altM });
	};
	push(pos);
	for (let j = 0; j < n; j++) {
		const legLen = (Math.floor(j / 2) + 1) * spacingM;
		const d = dirs[j % 4];
		pos = { x: pos.x + d.x * legLen, y: pos.y + d.y * legLen };
		push(pos);
	}
	return waypoints;
}

// Concentric orbit rings at rising altitudes, alternating direction so the
// vehicle spirals up a tower or facade for a face-on inspection.
export function structureScan({
	center,
	radiusM,
	points,
	baseAltM,
	layers,
	layerHeightM,
	clockwise
}: StructureScanParams): PatternPoint[] {
	if (!(radiusM > 0) || points < 3 || layers < 1) return [];
	const layerCount = Math.min(40, Math.round(layers));
	const out: PatternPoint[] = [];
	for (let l = 0; l < layerCount; l++) {
		out.push(
			...orbit({
				center,
				radiusM,
				points,
				altM: baseAltM + l * layerHeightM,
				clockwise: l % 2 === 0 ? clockwise : !clockwise
			})
		);
	}
	return out;
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
