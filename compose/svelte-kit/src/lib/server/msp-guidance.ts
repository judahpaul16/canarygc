// Server-side guidance loop for companion-flown Betaflight. It runs close to the
// MSP link (not in a browser tab that a scheduler could throttle), reads
// position each cycle, computes stick commands with the pure control law, and
// streams them as RC override. Safety is the point of this module: a deadman
// heartbeat and a GPS-loss check both release the override, which hands the
// craft back to Betaflight's own RX failsafe (GPS Rescue) rather than flying it
// blind.
import { building } from '$app/environment';
import { readNavState, sendRawRc, mspConfigured, setRcOverrideActive } from './msp';
import {
	computeGuidance,
	buildRcFrame,
	DEFAULT_GUIDANCE_CONFIG,
	DEFAULT_RC_CHANNELS,
	type GuidancePoint,
	type GuidanceConfig,
	type RcChannelConfig
} from '../msp-guidance';

const LOOP_MS = 100; // 10 Hz command rate
const DEADMAN_MS = 2500; // release if the client stops confirming it is watching
const GPS_LOSS_MS = 3000; // release if no usable fix persists this long
const HOLD_THROTTLE_US = 1500; // center throttle: Betaflight altitude hold governs height

export type GuidancePhase = 'idle' | 'guiding' | 'complete' | 'failsafe';

interface GuidanceSession {
	running: boolean;
	phase: GuidancePhase;
	waypoints: GuidancePoint[];
	index: number;
	guidanceCfg: GuidanceConfig;
	rcCfg: RcChannelConfig;
	timer: ReturnType<typeof setInterval> | null;
	lastHeartbeat: number;
	lastError: string | null;
	distanceM: number | null;
	noFixSince: number | null;
	inTick: boolean;
}

const g = globalThis as typeof globalThis & { __canarygcGuidance?: GuidanceSession };
const session: GuidanceSession = (g.__canarygcGuidance ??= {
	running: false,
	phase: 'idle',
	waypoints: [],
	index: 0,
	guidanceCfg: DEFAULT_GUIDANCE_CONFIG,
	rcCfg: DEFAULT_RC_CHANNELS,
	timer: null,
	lastHeartbeat: 0,
	lastError: null,
	distanceM: null,
	noFixSince: null,
	inTick: false
});

function release(phase: GuidancePhase, reason: string | null): void {
	if (session.running) setRcOverrideActive(false);
	session.running = false;
	session.phase = phase;
	session.lastError = reason;
	session.noFixSince = null;
	if (session.timer) {
		clearInterval(session.timer);
		session.timer = null;
	}
	// Stop sending overrides. Betaflight's RX failsafe takes the craft from here.
}

function centered(): number[] {
	const c = session.guidanceCfg.centerUs;
	return buildRcFrame({ roll: c, pitch: c, yaw: c }, HOLD_THROTTLE_US, true, session.rcCfg);
}

async function tick(): Promise<void> {
	if (!session.running || session.inTick) return;
	session.inTick = true;
	try {
		const now = Date.now();
		if (now - session.lastHeartbeat > DEADMAN_MS) {
			release('failsafe', 'Control link lost (no heartbeat); released to the flight controller failsafe.');
			return;
		}

		let nav;
		try {
			nav = await readNavState();
		} catch {
			release('failsafe', 'Telemetry read failed; released to the flight controller failsafe.');
			return;
		}

		const gps = nav.gps;
		const att = nav.attitude;
		const hasFix = !!gps && gps.fix >= 2 && Number.isFinite(gps.lat) && Number.isFinite(gps.lon);
		if (!hasFix || !att) {
			session.noFixSince ??= now;
			try {
				await sendRawRc(centered()); // hold level while waiting for a fix
			} catch {
				release('failsafe', 'RC override write failed; released to the flight controller failsafe.');
				return;
			}
			if (now - session.noFixSince > GPS_LOSS_MS) {
				release('failsafe', 'GPS fix lost; released to the flight controller failsafe.');
			}
			return;
		}
		session.noFixSince = null;

		const target = session.waypoints[session.index];
		const out = computeGuidance(
			{
				lat: gps.lat,
				lon: gps.lon,
				altM: nav.altitude?.altM ?? gps.altM ?? 0,
				headingDeg: att.yawDeg,
				groundSpeedMs: gps.speedMs,
				courseDeg: gps.courseDeg
			},
			target,
			session.guidanceCfg
		);
		session.distanceM = out.distanceM;

		try {
			await sendRawRc(buildRcFrame(out.sticks, HOLD_THROTTLE_US, true, session.rcCfg));
		} catch {
			release('failsafe', 'RC override write failed; released to the flight controller failsafe.');
			return;
		}

		if (out.reached) {
			if (session.index < session.waypoints.length - 1) session.index++;
			else session.phase = 'complete'; // hold at the final waypoint until stopped
		}
	} finally {
		session.inTick = false;
	}
}

export interface StartGuidanceOptions {
	guidanceCfg?: Partial<GuidanceConfig>;
	rcCfg?: Partial<RcChannelConfig>;
}

// Begins guiding an already-airborne Betaflight craft (armed, in Angle and
// altitude-hold modes) through the waypoints. The caller confirms the craft is
// flying and its channel directions are bench-tested; this loop only steers.
export async function startGuidance(
	waypoints: GuidancePoint[],
	opts: StartGuidanceOptions = {}
): Promise<{ ok: boolean; message: string }> {
	if (building || !mspConfigured()) return { ok: false, message: 'No flight controller is configured.' };
	if (waypoints.length === 0) return { ok: false, message: 'Guidance needs at least one waypoint.' };
	if (session.running) return { ok: false, message: 'Guidance is already running.' };

	// A position source is required: with no GPS fix there is no way to fly to
	// coordinates, so refuse up front rather than arm and immediately fail safe.
	try {
		const nav = await readNavState();
		const hasFix = !!nav.gps && nav.gps.fix >= 2 && Number.isFinite(nav.gps.lat) && Number.isFinite(nav.gps.lon);
		if (!hasFix) {
			return {
				ok: false,
				message:
					'Companion guidance needs a GPS fix: with no position source this craft cannot fly to waypoints. Fly it manually with a gamepad instead.'
			};
		}
	} catch {
		return { ok: false, message: 'Could not read the flight controller to check for a GPS fix.' };
	}

	session.waypoints = waypoints;
	session.index = 0;
	session.guidanceCfg = { ...DEFAULT_GUIDANCE_CONFIG, ...opts.guidanceCfg };
	session.rcCfg = { ...DEFAULT_RC_CHANNELS, ...opts.rcCfg };
	session.lastError = null;
	session.distanceM = null;
	session.noFixSince = null;
	session.lastHeartbeat = Date.now();
	session.phase = 'guiding';
	session.running = true;
	setRcOverrideActive(true);
	session.timer = setInterval(() => {
		void tick();
	}, LOOP_MS);
	return { ok: true, message: `Guiding ${waypoints.length} waypoints.` };
}

export function stopGuidance(): void {
	release('idle', 'Stopped by the operator; released to the flight controller.');
}

export function heartbeatGuidance(): void {
	session.lastHeartbeat = Date.now();
}

export function guidanceStatus(): {
	running: boolean;
	phase: GuidancePhase;
	index: number;
	count: number;
	distanceM: number | null;
	lastError: string | null;
} {
	return {
		running: session.running,
		phase: session.phase,
		index: session.index,
		count: session.waypoints.length,
		distanceM: session.distanceM,
		lastError: session.lastError
	};
}
