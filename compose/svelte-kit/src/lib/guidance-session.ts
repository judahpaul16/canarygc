// Shared client lifecycle for the two ways an MSP board flies a plan, so the
// dashboard controls, the mission planner, and the always-mounted status panel
// drive one session. INAV navigates its own mission onboard (upload waypoints,
// then arm and engage NAV WP), the same as a MAVLink autopilot; Betaflight has no
// waypoint engine and flies by companion guidance from the station. MAVLink runs
// the autopilot's own mission.
import { get, writable } from 'svelte/store';
import { missionPlanActionsStore } from '../stores/missionPlanStore';
import { fcProtocolStore, fcFirmwareStore } from '../stores/mavlinkStore';
import { showModal, notify } from './overlays';

interface MspMissionItem {
	type: string;
	lat: number;
	lon: number;
	alt: number | null;
}

const HEARTBEAT_MS = 1000;
const STATUS_MS = 500;

export interface GuidanceStatus {
	running: boolean;
	phase: string;
	index: number;
	count: number;
	distanceM: number | null;
	lastError: string | null;
}

export const guidanceRunningStore = writable(false);
export const guidanceStatusStore = writable<GuidanceStatus | null>(null);

let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
let statusTimer: ReturnType<typeof setInterval> | undefined;

export function isMspFc(): boolean {
	return get(fcProtocolStore) === 'msp';
}

export function isInavFc(): boolean {
	return get(fcProtocolStore) === 'msp' && get(fcFirmwareStore) === 'INAV';
}

export function isBetaflightFc(): boolean {
	return get(fcProtocolStore) === 'msp' && get(fcFirmwareStore) !== 'INAV';
}

// The loaded plan as MSP mission items in waypoint order, including the return or
// land action so INAV flies the whole mission and ends it the way the plan says.
function missionItemsForMsp(): MspMissionItem[] {
	const actions = get(missionPlanActionsStore);
	return Object.keys(actions)
		.map(Number)
		.sort((a, b) => a - b)
		.map((i) => ({ type: actions[i].type, lat: actions[i].lat, lon: actions[i].lon, alt: actions[i].alt ?? null }));
}

// The positional waypoints of the loaded plan, dropping takeoff, return, and the
// hidden home slot, which companion guidance does not fly to.
export function planWaypoints(): { lat: number; lon: number; altM: number }[] {
	const actions = get(missionPlanActionsStore);
	return Object.keys(actions)
		.map(Number)
		.sort((a, b) => a - b)
		.map((i) => actions[i])
		.filter(
			(a) =>
				a.type?.startsWith('NAV_') &&
				a.type !== 'NAV_TAKEOFF' &&
				a.type !== 'NAV_RETURN_TO_LAUNCH' &&
				a.lat !== 0 &&
				a.lon !== 0
		)
		.map((a) => ({ lat: a.lat, lon: a.lon, altM: a.alt ?? 0 }));
}

function teardown(): void {
	guidanceRunningStore.set(false);
	clearInterval(heartbeatTimer);
	heartbeatTimer = undefined;
	clearInterval(statusTimer);
	statusTimer = undefined;
}

async function pollStatus(): Promise<void> {
	try {
		const res = await fetch('/api/msp/guidance_status');
		if (!res.ok) return;
		const status = (await res.json()) as GuidanceStatus;
		guidanceStatusStore.set(status);
		if (!status.running) {
			teardown();
			if (status.lastError) {
				notify({
					title: status.phase === 'failsafe' ? 'Guidance failsafe' : 'Guidance ended',
					content: status.lastError,
					type: status.phase === 'failsafe' ? 'warning' : 'info'
				});
			}
		}
	} catch {
		// Transient; the next poll retries.
	}
}

export async function startGuidance(waypoints: { lat: number; lon: number; altM: number }[]): Promise<void> {
	try {
		const res = await fetch('/api/msp/guidance_start', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ waypoints })
		});
		const data = await res.json();
		if (!res.ok) {
			showModal({ title: 'Guidance failed', content: data.message ?? data.error, notification: true });
			return;
		}
		guidanceRunningStore.set(true);
		guidanceStatusStore.set(null);
		heartbeatTimer = setInterval(() => {
			fetch('/api/msp/guidance_heartbeat', { method: 'POST' }).catch(() => {});
		}, HEARTBEAT_MS);
		statusTimer = setInterval(pollStatus, STATUS_MS);
		notify({ title: 'Guidance started', content: data.message });
	} catch (error) {
		showModal({ title: 'Guidance failed', content: (error as Error).message, notification: true });
	}
}

export async function stopGuidance(): Promise<void> {
	try {
		await fetch('/api/msp/guidance_stop', { method: 'POST' });
	} catch {
		// Drop the client timers regardless.
	}
	teardown();
	notify({ title: 'Guidance stopped', content: 'Control released to the flight controller.' });
}

// Flies the loaded plan by companion guidance after a one-time safety
// confirmation. Used wherever a "fly the plan" control is pressed on an MSP FC.
export function startGuidanceWithConfirm(): void {
	const waypoints = planWaypoints();
	if (waypoints.length === 0) {
		notify({ title: 'No waypoints', content: 'Add positional waypoints to the plan first.', type: 'warning' });
		return;
	}
	showModal({
		title: 'Fly by companion guidance',
		content:
			'The station steers this craft over MSP; it must already be airborne, armed, and in Angle + Altitude Hold. Keep the transmitter ready as a kill switch.',
		confirmation: true,
		confirmLabel: 'Start guidance',
		inputs: [{ type: 'checkbox', placeholder: 'I bench-tested channel directions with props off', required: true }],
		onConfirm: (values) => {
			if (values[0] === 'true') startGuidance(waypoints);
		}
	});
}

// INAV native mission: INAV flies its own onboard mission, so the station only
// engages it (arm and NAV WP over MSP) and holds a heartbeat. The status panel
// shares this running store with companion guidance so one panel covers both.
export interface InavMissionStatus {
	running: boolean;
	phase: string;
	assigned: number;
	lastError: string | null;
}

export const inavRunningStore = writable(false);
export const inavStatusStore = writable<InavMissionStatus | null>(null);

let inavHeartbeatTimer: ReturnType<typeof setInterval> | undefined;
let inavStatusTimer: ReturnType<typeof setInterval> | undefined;

function inavTeardown(): void {
	inavRunningStore.set(false);
	clearInterval(inavHeartbeatTimer);
	inavHeartbeatTimer = undefined;
	clearInterval(inavStatusTimer);
	inavStatusTimer = undefined;
}

async function inavPollStatus(): Promise<void> {
	try {
		const res = await fetch('/api/msp/inav_status');
		if (!res.ok) return;
		const status = (await res.json()) as InavMissionStatus;
		inavStatusStore.set(status);
		if (!status.running) {
			inavTeardown();
			if (status.lastError) {
				notify({
					title: status.phase === 'failsafe' ? 'Mission failsafe' : 'Mission ended',
					content: status.lastError,
					type: status.phase === 'failsafe' ? 'warning' : 'info'
				});
			}
		}
	} catch {
		// Transient; the next poll retries.
	}
}

function beginInavSession(): void {
	inavRunningStore.set(true);
	inavStatusStore.set(null);
	inavHeartbeatTimer = setInterval(() => {
		fetch('/api/msp/inav_heartbeat', { method: 'POST' }).catch(() => {});
	}, HEARTBEAT_MS);
	inavStatusTimer = setInterval(inavPollStatus, STATUS_MS);
}

async function postInav(path: string, body: unknown, startedTitle: string): Promise<void> {
	try {
		const res = await fetch(path, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data = await res.json();
		if (!res.ok) {
			showModal({ title: 'Mission failed', content: data.message ?? data.error, notification: true });
			return;
		}
		beginInavSession();
		notify({ title: startedTitle, content: data.message });
	} catch (error) {
		showModal({ title: 'Mission failed', content: (error as Error).message, notification: true });
	}
}

export async function stopInavMission(): Promise<void> {
	try {
		await fetch('/api/msp/inav_stop', { method: 'POST' });
	} catch {
		// Drop the client timers regardless.
	}
	inavTeardown();
	notify({ title: 'Mission stopped', content: 'Control released to the flight controller.' });
}

// Uploads the loaded plan and engages it. INAV arms, auto-takes-off, flies the
// waypoints, and runs the plan's end action itself.
export function startInavMissionWithConfirm(): void {
	const items = missionItemsForMsp();
	if (items.length === 0) {
		notify({ title: 'No mission', content: 'Add waypoints to the plan first.', type: 'warning' });
		return;
	}
	showModal({
		title: 'Start INAV mission',
		content:
			'INAV arms and flies the uploaded mission on its own, including an automatic takeoff. Make sure the area is clear, the craft has a GPS fix, and the transmitter is ready as a kill switch.',
		confirmation: true,
		confirmLabel: 'Start mission',
		inputs: [{ type: 'checkbox', placeholder: 'The area is clear and I am ready for an automatic takeoff', required: true }],
		onConfirm: (values) => {
			if (values[0] === 'true') postInav('/api/msp/inav_mission_start', { waypoints: items }, 'Mission engaged');
		}
	});
}

// Climbs to an altitude under INAV navigation and holds, the MSP counterpart of a
// MAVLink NAV_TAKEOFF.
export function takeoffInavWithConfirm(): void {
	showModal({
		title: 'Take off (INAV)',
		content:
			'INAV arms and climbs to the altitude under navigation, then holds position. Make sure the area is clear and the craft has a GPS fix.',
		confirmation: true,
		confirmLabel: 'Take off',
		inputs: [
			{ type: 'number', placeholder: 'Altitude (m)', required: true },
			{ type: 'checkbox', placeholder: 'The area is clear and I am ready for an automatic takeoff', required: true }
		],
		onConfirm: (values) => {
			if (values[1] === 'true') postInav('/api/msp/inav_takeoff', { altM: Number(values[0]) }, 'Taking off');
		}
	});
}

// Whether either MSP flight session (guidance or INAV mission) is running, for the
// shared status panel.
export function anyMspFlightRunning(): boolean {
	return get(guidanceRunningStore) || get(inavRunningStore);
}
