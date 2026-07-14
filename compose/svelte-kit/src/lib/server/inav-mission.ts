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
	type MspMissionItem
} from './msp';
import { planInavEngage, buildInavRcFrame, type InavEngagePlan } from '../inav-mission';

const LOOP_MS = 100; // 10 Hz keepalive: INAV failsafes if RC frames stop
const DEADMAN_MS = 2500; // release if the station stops confirming it is watching

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
	inTick: false
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
			await sendRawRc(buildInavRcFrame(session.plan, true));
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
