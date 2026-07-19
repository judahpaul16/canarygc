// Shared client lifecycle for the two ways an MSP board flies a plan, so the
// dashboard controls, the mission planner, and the always-mounted status panel
// drive one session. INAV navigates its own mission onboard (upload waypoints,
// then arm and engage NAV WP), the same as a MAVLink autopilot; Betaflight has no
// waypoint engine and flies by companion guidance from the station. MAVLink runs
// the autopilot's own mission.
import { get, writable } from 'svelte/store';
import { missionPlanActionsStore } from '../stores/missionPlanStore';
import { fcProtocolStore, fcFirmwareStore, mavSatelliteStore } from '../stores/mavlinkStore';
import { showModal, notify, type ModalInput } from './overlays';
import { preflightCheck, takeoffCheck } from './preflight';
import { m } from '$lib/paraglide/messages';

const GPS_MIN_SATS = 6;

// INAV navigates a mission onboard and cannot without a position fix, the same as
// an ArduPilot or PX4 autopilot. When the board reports no usable fix, say so
// plainly up front instead of asking for an altitude and refusing after; the
// server stays the authority and refuses too.
function inavHasNoFix(): boolean {
	const sat = get(mavSatelliteStore);
	if (sat.total >= GPS_MIN_SATS) return false;
	showModal({
		title: m.gs_no_gps_title(),
		content: m.gs_no_gps_body({ count: sat.total }),
		notification: true
	});
	return true;
}

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
					title: status.phase === 'failsafe' ? m.gs_failsafe() : m.gs_ended(),
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
			showModal({ title: m.gs_failed(), content: data.message ?? data.error, notification: true });
			return;
		}
		guidanceRunningStore.set(true);
		guidanceStatusStore.set(null);
		heartbeatTimer = setInterval(() => {
			fetch('/api/msp/guidance_heartbeat', { method: 'POST' }).catch(() => {});
		}, HEARTBEAT_MS);
		statusTimer = setInterval(pollStatus, STATUS_MS);
		notify({ title: m.gs_started(), content: data.message });
	} catch (error) {
		showModal({ title: m.gs_failed(), content: (error as Error).message, notification: true });
	}
}

export async function stopGuidance(): Promise<void> {
	try {
		await fetch('/api/msp/guidance_stop', { method: 'POST' });
	} catch {
		// Drop the client timers regardless.
	}
	teardown();
	notify({ title: m.gs_stopped(), content: m.gs_control_released() });
}

// Flies the loaded plan by companion guidance after a one-time safety
// confirmation. Used wherever a "fly the plan" control is pressed on an MSP FC.
export function startGuidanceWithConfirm(): void {
	const waypoints = planWaypoints();
	if (waypoints.length === 0) {
		notify({ title: m.gs_no_waypoints_title(), content: m.gs_no_waypoints_body(), type: 'warning' });
		return;
	}
	showModal({
		title: m.gs_fly_companion_title(),
		content: m.gs_fly_companion_body(),
		confirmation: true,
		confirmLabel: m.gs_start_guidance_btn(),
		inputs: [{ type: 'checkbox', placeholder: m.gs_bench_tested_check(), required: true }],
		onConfirm: async (values) => {
			if (values[0] !== 'true') return;
			if (!(await preflightCheck(get(missionPlanActionsStore)))) return;
			await startGuidance(waypoints);
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
					title: status.phase === 'failsafe' ? m.gs_mission_failsafe() : m.gs_mission_ended(),
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
			showModal({ title: m.gs_mission_failed(), content: data.message ?? data.error, notification: true });
			return;
		}
		beginInavSession();
		notify({ title: startedTitle, content: data.message });
	} catch (error) {
		showModal({ title: m.gs_mission_failed(), content: (error as Error).message, notification: true });
	}
}

export async function stopInavMission(): Promise<void> {
	try {
		await fetch('/api/msp/inav_stop', { method: 'POST' });
	} catch {
		// Drop the client timers regardless.
	}
	inavTeardown();
	notify({ title: m.gs_mission_stopped(), content: m.gs_control_released() });
}

const rthLandingChoices = () => [
	{ value: '0', label: m.gs_rth_never() },
	{ value: '1', label: m.gs_rth_any() },
	{ value: '2', label: m.gs_rth_failsafe() }
];

// Uploads the loaded plan and engages it. INAV arms, auto-takes-off, flies the
// waypoints, and runs the plan's end action itself. A plane cannot hover, so
// whether its return to home ends in a landing or a loiter overhead
// (nav_rth_allow_landing) is offered before the mission runs.
export async function startInavMissionWithConfirm(): Promise<void> {
	const items = missionItemsForMsp();
	if (items.length === 0) {
		notify({ title: m.gs_no_mission_title(), content: m.gs_no_mission_body(), type: 'warning' });
		return;
	}
	if (inavHasNoFix()) return;
	let rth: { platform?: string; value?: number | null } = {};
	try {
		const res = await fetch('/api/msp/rth_landing');
		if (res.ok) rth = await res.json();
	} catch {
		// The modal simply omits the landing selector.
	}
	const askLanding = rth.platform === 'Airplane';
	const current = rth.value ?? null;
	const inputs: ModalInput[] = [
		{ type: 'checkbox', placeholder: m.gs_area_clear_check(), required: true }
	];
	if (askLanding) {
		inputs.push({
			type: 'select',
			label: m.gs_rth_landing_label(),
			placeholder: '',
			required: false,
			value: current === null ? '' : String(current),
			options: [
				...(current === null ? [{ value: '', label: m.sm_keep_current() }] : []),
				...rthLandingChoices()
			]
		});
	}
	showModal({
		title: m.gs_start_inav_title(),
		content:
			m.gs_start_inav_body() +
			(askLanding
				? '\n\n' + m.gs_start_inav_landing_note()
				: ''),
		confirmation: true,
		confirmLabel: m.gs_start_mission_btn(),
		inputs,
		onConfirm: async (values) => {
			if (values[0] !== 'true') return;
			if (!(await preflightCheck(get(missionPlanActionsStore)))) return;
			const picked = values[1] ?? '';
			if (askLanding && picked !== '' && Number(picked) !== current) {
				try {
					const res = await fetch('/api/msp/rth_landing', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ value: Number(picked) })
					});
					if (!res.ok) throw new Error('rejected');
				} catch {
					notify({
						title: m.gs_landing_not_applied_title(),
						content: m.gs_landing_rejected_body(),
						type: 'warning'
					});
				}
			}
			await postInav('/api/msp/inav_mission_start', { waypoints: items }, m.gs_mission_engaged());
		}
	});
}

// Climbs to an altitude under INAV navigation and holds, the MSP counterpart of a
// MAVLink NAV_TAKEOFF.
export function takeoffInavWithConfirm(): void {
	if (inavHasNoFix()) return;
	showModal({
		title: m.gs_takeoff_inav_title(),
		content: m.gs_takeoff_inav_body(),
		confirmation: true,
		confirmLabel: m.gs_takeoff_btn(),
		inputs: [
			{ type: 'number', placeholder: m.tl_altitude_placeholder(), required: true },
			{ type: 'checkbox', placeholder: m.gs_area_clear_check(), required: true }
		],
		onConfirm: async (values) => {
			if (values[1] !== 'true') return;
			const altM = Number(values[0]);
			if (!(await takeoffCheck(altM))) return;
			postInav('/api/msp/inav_takeoff', { altM }, m.gs_taking_off());
		}
	});
}

// Whether either MSP flight session (guidance or INAV mission) is running, for the
// shared status panel.
export function anyMspFlightRunning(): boolean {
	return get(guidanceRunningStore) || get(inavRunningStore);
}
