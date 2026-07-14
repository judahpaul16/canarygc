// Companion-computer guidance for a Betaflight flight controller, which has no
// onboard waypoint navigation. The station runs the outer position loop here and
// streams stick commands to the board over MSP RC override, using Betaflight as
// the inner-loop stabilizer (Angle mode). These are pure functions so the
// control law and channel mapping are testable without a live link.
import { haversineMeters, bearingDegrees, type LatLon } from './geo';

export interface GuidancePoint {
	lat: number;
	lon: number;
	altM: number;
}

export interface GuidanceVehicle {
	lat: number;
	lon: number;
	altM: number;
	headingDeg: number; // 0..360, 0 = north
	groundSpeedMs: number; // GPS ground speed
	courseDeg: number; // GPS course over ground
}

export interface GuidanceConfig {
	acceptRadiusM: number; // a waypoint counts as reached within this distance
	cruiseSpeedMs: number; // target horizontal speed between waypoints
	approachDistanceM: number; // ease the speed command down within this range
	velToTiltDeg: number; // velocity error (m/s) to commanded lean (deg)
	maxTiltDeg: number; // clamp on the commanded lean angle
	tiltStickUsPerDeg: number; // commanded lean (deg) to stick microseconds
	maxHorizStickUs: number; // clamp on the roll/pitch offset from center
	yawStickUsPerDeg: number; // heading error (deg) to yaw stick microseconds
	maxYawStickUs: number; // clamp on the yaw offset from center
	centerUs: number; // stick center, 1500
	// Channel directions for this airframe's stick convention, defaulted to the
	// common Betaflight AETR setup. Bench-test them before flight: a wrong sign
	// drives the craft away from the waypoint instead of toward it.
	pitchSign: 1 | -1; // forward command to pitch stick direction
	rollSign: 1 | -1;
	yawSign: 1 | -1;
}

export const DEFAULT_GUIDANCE_CONFIG: GuidanceConfig = {
	acceptRadiusM: 3,
	cruiseSpeedMs: 4,
	approachDistanceM: 12,
	velToTiltDeg: 3,
	maxTiltDeg: 15,
	tiltStickUsPerDeg: 12,
	maxHorizStickUs: 200,
	yawStickUsPerDeg: 3,
	maxYawStickUs: 150,
	centerUs: 1500,
	pitchSign: -1, // Betaflight pitch channel below center pitches the nose down (forward)
	rollSign: 1, // above center rolls right
	yawSign: 1 // above center yaws clockwise
};

export interface Sticks {
	roll: number;
	pitch: number;
	yaw: number;
}

export interface GuidanceOutput {
	sticks: Sticks; // microseconds; throttle stays with the FC altitude hold
	distanceM: number;
	bearingDeg: number;
	reached: boolean;
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const wrap180 = (deg: number): number => (((deg + 180) % 360) + 360) % 360 - 180;
const rad = (deg: number): number => (deg * Math.PI) / 180;

// A velocity controller: it drives the GPS velocity vector toward a
// waypoint-ward command and expresses the error as body-frame lean, then maps
// lean to stick microseconds. Throttle is left centered so a Betaflight
// altitude-hold mode governs height; the loop only steers the horizontal track
// and points the nose at the target.
export function computeGuidance(
	vehicle: GuidanceVehicle,
	target: GuidancePoint,
	cfg: GuidanceConfig = DEFAULT_GUIDANCE_CONFIG
): GuidanceOutput {
	const from: LatLon = { lat: vehicle.lat, lon: vehicle.lon };
	const to: LatLon = { lat: target.lat, lon: target.lon };
	const distanceM = haversineMeters(from, to);
	const bearingDeg = bearingDegrees(from, to);

	const speedCmd = cfg.cruiseSpeedMs * clamp(distanceM / cfg.approachDistanceM, 0, 1);
	const desN = speedCmd * Math.cos(rad(bearingDeg));
	const desE = speedCmd * Math.sin(rad(bearingDeg));
	const curN = vehicle.groundSpeedMs * Math.cos(rad(vehicle.courseDeg));
	const curE = vehicle.groundSpeedMs * Math.sin(rad(vehicle.courseDeg));
	const errN = desN - curN;
	const errE = desE - curE;

	const psi = rad(vehicle.headingDeg);
	const fwd = errN * Math.cos(psi) + errE * Math.sin(psi);
	const right = -errN * Math.sin(psi) + errE * Math.cos(psi);

	const pitchDeg = clamp(fwd * cfg.velToTiltDeg, -cfg.maxTiltDeg, cfg.maxTiltDeg);
	const rollDeg = clamp(right * cfg.velToTiltDeg, -cfg.maxTiltDeg, cfg.maxTiltDeg);
	const pitch =
		cfg.centerUs +
		cfg.pitchSign * clamp(pitchDeg * cfg.tiltStickUsPerDeg, -cfg.maxHorizStickUs, cfg.maxHorizStickUs);
	const roll =
		cfg.centerUs +
		cfg.rollSign * clamp(rollDeg * cfg.tiltStickUsPerDeg, -cfg.maxHorizStickUs, cfg.maxHorizStickUs);

	const headErr = wrap180(bearingDeg - vehicle.headingDeg);
	const yaw =
		cfg.centerUs +
		cfg.yawSign * clamp(headErr * cfg.yawStickUsPerDeg, -cfg.maxYawStickUs, cfg.maxYawStickUs);

	return {
		sticks: { roll: Math.round(roll), pitch: Math.round(pitch), yaw: Math.round(yaw) },
		distanceM,
		bearingDeg,
		reached: distanceM <= cfg.acceptRadiusM
	};
}

export interface RcChannelConfig {
	channelCount: number; // channels to send (>= 8 covers AUX1..4)
	rollIndex: number; // 0-based channel positions, defaulted to Betaflight AETR
	pitchIndex: number;
	throttleIndex: number;
	yawIndex: number;
	armIndex: number; // AUX channel that arms (AUX1 = index 4)
	armUs: number; // value that arms
	disarmUs: number; // value that disarms and the resting value for other aux
}

export const DEFAULT_RC_CHANNELS: RcChannelConfig = {
	channelCount: 8,
	rollIndex: 0,
	pitchIndex: 1,
	throttleIndex: 2,
	yawIndex: 3,
	armIndex: 4,
	armUs: 1800,
	disarmUs: 1000
};

// Assembles a full RC channel frame (microseconds) for MSP_SET_RAW_RC from the
// guidance sticks, a throttle value, and the arm state. Aux channels default to
// their resting low value so no flight mode fires by accident; the arm channel
// carries the arm state.
export function buildRcFrame(
	sticks: Sticks,
	throttleUs: number,
	armed: boolean,
	cfg: RcChannelConfig = DEFAULT_RC_CHANNELS
): number[] {
	const ch: number[] = new Array(cfg.channelCount).fill(cfg.disarmUs);
	ch[cfg.rollIndex] = sticks.roll;
	ch[cfg.pitchIndex] = sticks.pitch;
	ch[cfg.throttleIndex] = throttleUs;
	ch[cfg.yawIndex] = sticks.yaw;
	ch[cfg.armIndex] = armed ? cfg.armUs : cfg.disarmUs;
	return ch;
}
