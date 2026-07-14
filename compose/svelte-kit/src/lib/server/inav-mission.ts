// Runs an INAV waypoint mission the way an ArduPilot or PX4 autopilot runs its
// own: INAV navigates onboard while the station only commands it. INAV starts a
// mission when it is armed and NAV WP is active, and a mode turns on only while
// its aux channel sits inside a configured range, so this module reads the mode
// ranges, makes sure ARM and NAV WP have aux channels (assigning spare ones for
// this flight if the board has none), and then holds those channels active over
// MSP RC override at a fixed rate. INAV does the takeoff, the waypoints, and the
// end-of-mission action itself. A deadman heartbeat stops the stream if the
// station goes quiet, handing the craft to INAV's own RC-loss failsafe (return
// to home) rather than flying it blind.
import { building } from '$app/environment';
import {
	readNavState,
	readModeConfig,
	setModeRange,
	sendRawRc,
	uploadMissionMsp,
	mspConfigured,
	ensureMspReceiver,
	type MspMissionItem
} from './msp';
import { planInavEngage, buildInavRcFrame, type InavEngagePlan } from '../inav-mission';

const LOOP_MS = 100; // 10 Hz keepalive: INAV failsafes if RC frames stop
const DEADMAN_MS = 2500; // release if the station stops confirming it is watching
// The channels follow a transmitter's takeoff sequence, phased purely on time so
// the tick only ever writes the RC frame and never reads on the same link (a
// read interleaved with the override stream corrupts the frame cadence and INAV
// drops the mode): everything low first so the flight controller sees the arm
// switch transition (it refuses a switch that was already high when RC
// appeared), then arm with the nav channel low and throttle low (it refuses to
// arm with a nav mode engaged or throttle up), then an open throttle climb with
// nav still off (a multirotor does not auto-launch under nav; it must reach a
// hover first), and finally NAV WP with mid throttle, where navigation owns
// altitude to each waypoint's setpoint.
const ARM_SETTLE_MS = 1500;
const CLIMB_START_MS = 3000;
const NAV_ENGAGE_MS = 8000; // climb ~5 s to a safe hover, then hand to navigation
const THROTTLE_LOW_US = 1000;
const THROTTLE_CLIMB_US = 1650;
const THROTTLE_MID_US = 1500;

export type InavPhase = 'idle' | 'engaged' | 'failsafe';

interface InavSession {
	running: boolean;
	phase: InavPhase;
	plan: InavEngagePlan | null;
	assigned: number;
	timer: ReturnType<typeof setInterval> | null;
	lastHeartbeat: number;
	lastError: string | null;
	inTick: boolean;
	startedAt: number;
}

const g = globalThis as typeof globalThis & { __canarygcInavMission?: InavSession };
const session: InavSession = (g.__canarygcInavMission ??= {
	running: false,
	phase: 'idle',
	plan: null,
	assigned: 0,
	timer: null,
	lastHeartbeat: 0,
	lastError: null,
	inTick: false,
	startedAt: 0,
});

function release(phase: InavPhase, reason: string | null): void {
	session.running = false;
	session.phase = phase;
	session.lastError = reason;
	if (session.timer) {
		clearInterval(session.timer);
		session.timer = null;
	}
	// Stop sending overrides. INAV's own RC-loss failsafe takes the craft from here.
}

async function tick(): Promise<void> {
	if (!session.running || session.inTick || !session.plan) return;
	session.inTick = true;
	try {
		if (Date.now() - session.lastHeartbeat > DEADMAN_MS) {
			release('failsafe', 'Control link lost (no heartbeat); released to the flight controller failsafe.');
			return;
		}
		try {
			const elapsed = Date.now() - session.startedAt;
			const armed = elapsed >= ARM_SETTLE_MS;
			const nav = elapsed >= NAV_ENGAGE_MS;
			const climbing = armed && !nav && elapsed >= CLIMB_START_MS;
			const throttle = nav ? THROTTLE_MID_US : climbing ? THROTTLE_CLIMB_US : THROTTLE_LOW_US;
			await sendRawRc(buildInavRcFrame(session.plan, armed, nav, throttle));
		} catch {
			release('failsafe', 'RC override write failed; released to the flight controller failsafe.');
		}
	} finally {
		session.inTick = false;
	}
}

// Confirms a usable GPS fix, then engages: reads the board's mode ranges, works
// out (or assigns) the aux channels for ARM and NAV WP, writes any assignments,
// and starts holding them active. INAV arms and flies the loaded mission.
async function engage(context: string): Promise<{ ok: boolean; message: string }> {
	if (building || !mspConfigured()) return { ok: false, message: 'No flight controller is configured.' };
	if (session.running) return { ok: false, message: 'A mission is already running.' };

	// The engage drives the arm and NAV WP channels over MSP RC override, which
	// the flight controller only applies when its receiver is MSP.
	const rx = await ensureMspReceiver();
	if (!rx.ok) return { ok: false, message: rx.message };

	let nav;
	try {
		nav = await readNavState();
	} catch {
		return { ok: false, message: 'Could not read the flight controller to check for a GPS fix.' };
	}
	const hasFix = !!nav.gps && nav.gps.fix >= 2 && Number.isFinite(nav.gps.lat) && Number.isFinite(nav.gps.lon);
	if (!hasFix) {
		return {
			ok: false,
			message: 'INAV needs a GPS fix to navigate a mission. Wait for a fix, or fly manually with a gamepad.'
		};
	}

	let plan: InavEngagePlan;
	try {
		const mode = await readModeConfig();
		plan = planInavEngage(mode);
		for (const a of plan.assignments) await setModeRange(a);
	} catch (err) {
		return { ok: false, message: `Could not read or set the flight modes: ${(err as Error).message}` };
	}

	session.plan = plan;
	session.assigned = plan.assignments.length;
	session.lastError = null;
	session.lastHeartbeat = Date.now();
	session.startedAt = Date.now();
	session.phase = 'engaged';
	session.running = true;
	session.timer = setInterval(() => void tick(), LOOP_MS);

	const assignedNote = plan.assignments.length
		? ` Assigned ARM and NAV WP to spare aux channels for this flight.`
		: '';
	return { ok: true, message: `${context} INAV is arming and flying the mission.${assignedNote}` };
}

// Starts the loaded mission. Optional waypoints upload first so one action both
// loads and runs, the way an autopilot's start-mission does.
export async function startInavMission(waypoints?: MspMissionItem[]): Promise<{ ok: boolean; message: string }> {
	if (waypoints && waypoints.length) {
		const up = await uploadMissionMsp(waypoints);
		if (!up.ok) return up;
	}
	return engage('Mission engaged;');
}

// Takes off to an altitude by uploading a single waypoint directly overhead and
// engaging it: INAV climbs to the point and holds, its onboard auto-takeoff, the
// same shape as a MAVLink NAV_TAKEOFF.
export async function startInavTakeoff(altM: number): Promise<{ ok: boolean; message: string }> {
	if (building || !mspConfigured()) return { ok: false, message: 'No flight controller is configured.' };
	let nav;
	try {
		nav = await readNavState();
	} catch {
		return { ok: false, message: 'Could not read the flight controller to check for a GPS fix.' };
	}
	const gps = nav.gps;
	if (!gps || gps.fix < 2 || !Number.isFinite(gps.lat) || !Number.isFinite(gps.lon)) {
		return { ok: false, message: 'INAV needs a GPS fix to take off under navigation. Wait for a fix.' };
	}
	const point: MspMissionItem = { type: 'NAV_WAYPOINT', lat: gps.lat, lon: gps.lon, alt: Math.max(1, altM) };
	const up = await uploadMissionMsp([point]);
	if (!up.ok) return up;
	return engage(`Taking off to ${Math.round(altM)} m;`);
}

export function stopInavMission(): void {
	release('idle', 'Stopped by the operator; released to the flight controller.');
}

export function heartbeatInavMission(): void {
	session.lastHeartbeat = Date.now();
}

export function inavMissionStatus(): {
	running: boolean;
	phase: InavPhase;
	assigned: number;
	lastError: string | null;
} {
	return {
		running: session.running,
		phase: session.phase,
		assigned: session.assigned,
		lastError: session.lastError
	};
}
