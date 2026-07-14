// Shared client lifecycle for companion guidance so the dashboard controls, the
// mission planner, and the always-mounted status panel drive one session. On an
// MSP flight controller (Betaflight or INAV) the "fly the plan" controls route
// here; on MAVLink they run the autopilot's own mission.
import { get, writable } from 'svelte/store';
import { missionPlanActionsStore } from '../stores/missionPlanStore';
import { fcProtocolStore } from '../stores/mavlinkStore';
import { showModal, notify } from './overlays';

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
