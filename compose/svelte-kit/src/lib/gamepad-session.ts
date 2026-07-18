import { get, writable } from 'svelte/store';
import { mount, unmount } from 'svelte';
import { firstGamepad, startGamepadLoop } from './gamepad-control';
import { setFlightMode } from './mavlink-client';
import { sendManualFrame, manualTransportIsMsp } from './manual-transport';
import { isPX4, isPlane } from './flight-modes';
import { mavArmedStateStore } from '../stores/mavlinkStore';
import { notify, overlayTarget, showModal } from './overlays';
import GamepadConnect from '../components/GamepadConnect.svelte';
import { m } from '$lib/paraglide/messages';

// One MANUAL_CONTROL stream for the whole app: the dashboard Controls button
// and the fullscreen dock toggle both drive this session, so enabling from
// either place shows active everywhere and never doubles the stream.
export const gamepadActiveStore = writable(false);

let stop: (() => void) | null = null;

// A pilot position mode only engages once the autopilot is receiving manual
// input, so the mode switch trails the first streamed frames.
const MODE_SWITCH_DELAY_MS = 400;
const MODE_SWITCH_RETRY_MS = 800;

// Armed is the mode-switch predicate: some stacks report loose MAV_STATE
// values while disarmed, but the armed bit in the heartbeat is dependable,
// and both stick modes hold position harmlessly for an armed vehicle still
// on the ground.
function inFlight(): boolean {
	return get(mavArmedStateStore) === true;
}

async function enterStickMode(attempt = 1): Promise<void> {
	if (!get(gamepadActiveStore) || !inFlight()) return;
	if (await setFlightMode('POSCTL')) {
		const label = isPX4() ? m.gpad_mode_position() : isPlane() ? m.gpad_mode_cruise() : m.gpad_mode_loiter();
		const behavior = isPlane()
			? m.gpad_behavior_plane()
			: m.gpad_behavior_multi();
		notify({
			title: m.gpad_active_title(),
			content: m.gpad_active_body({ label, behavior }),
			type: 'info'
		});
		return;
	}
	if (attempt < 2) {
		setTimeout(() => void enterStickMode(attempt + 1), MODE_SWITCH_RETRY_MS);
		return;
	}
	notify({
		title: m.gpad_mode_rejected_title(),
		content: m.gpad_mode_rejected_body(),
		type: 'warning'
	});
}

// Hands the vehicle to an autonomous hold the moment stick input ends, so it
// never sits in a pilot mode waiting for frames that stopped: Hold on PX4,
// GUIDED position hold on ArduPilot. A paused mission stays paused until
// Start/Resume relaunches it.
async function settleAfterStream(reason: 'stopped' | 'disconnected'): Promise<void> {
	if (inFlight()) {
		await setFlightMode(isPX4() ? 'LOITER' : 'GUIDED');
		notify({
			title: m.gpad_stopped_title(),
			content: m.gpad_stopped_body(),
			type: 'info'
		});
	}
	if (reason === 'disconnected') {
		notify({ title: m.gpad_disconnected_title(), content: m.gpad_disconnected_body(), type: 'warning' });
	}
}

// On MAVLink, engage the stick-flying mode the moment the vehicle arms, so the
// operator does not re-toggle the gamepad after takeoff.
let unwatchArm: (() => void) | null = null;
function watchArmForStickMode(): void {
	let prevArmed = get(mavArmedStateStore);
	unwatchArm = mavArmedStateStore.subscribe((armed) => {
		if (armed && !prevArmed && get(gamepadActiveStore)) {
			setTimeout(() => void enterStickMode(), MODE_SWITCH_DELAY_MS);
		}
		prevArmed = armed;
	});
}

function start(): boolean {
	if (!firstGamepad()) return false;
	if (manualTransportIsMsp()) {
		startMspGamepad();
		return true;
	}
	gamepadActiveStore.set(true);
	stop = startGamepadLoop(
		(frame) => void sendManualFrame(frame),
		(reason) => {
			gamepadActiveStore.set(false);
			stop = null;
			unwatchArm?.();
			unwatchArm = null;
			void settleAfterStream(reason);
		}
	);
	if (inFlight()) {
		setTimeout(() => void enterStickMode(), MODE_SWITCH_DELAY_MS);
	} else {
		notify({
			title: m.gpad_streaming_title(),
			content: m.gpad_streaming_body(),
			type: 'info'
		});
	}
	watchArmForStickMode();
	return true;
}

// MSP manual flight: the station is the craft's receiver, so it arms and flies
// over MSP. Preparing the board sets MSP as the receiver and resolves the arm
// channel; the stream then arms once the throttle is low. Arming spins the motors,
// so it is gated behind a props-clear confirmation.
function startMspGamepad(): void {
	showModal({
		title: m.gpad_msp_title(),
		content: m.gpad_msp_body(),
		confirmation: true,
		confirmLabel: m.gpad_arm_and_fly(),
		inputs: [{ type: 'checkbox', placeholder: m.gpad_props_clear_check(), required: true }],
		onConfirm: async (values) => {
			if (values[0] !== 'true') return;
			gamepadActiveStore.set(true);
			notify({ title: m.gpad_flight_title(), content: m.gpad_preparing_body(), type: 'info' });
			let data: { ok?: boolean; message?: string; error?: string };
			try {
				const res = await fetch('/api/msp/manual_start', { method: 'POST' });
				data = await res.json();
				if (!res.ok) {
					showModal({
						title: m.gpad_flight_failed_title(),
						content: data.message ?? data.error ?? m.gpad_rejected_body(),
						notification: true
					});
					gamepadActiveStore.set(false);
					return;
				}
			} catch (error) {
				showModal({ title: m.gpad_flight_failed_title(), content: (error as Error).message, notification: true });
				gamepadActiveStore.set(false);
				return;
			}
			if (!get(gamepadActiveStore)) {
				fetch('/api/msp/manual_stop', { method: 'POST' }).catch(() => {});
				return;
			}
			stop = startGamepadLoop(
				(frame) => void sendManualFrame(frame),
				() => {
					gamepadActiveStore.set(false);
					stop = null;
					fetch('/api/msp/manual_stop', { method: 'POST' }).catch(() => {});
					notify({ title: m.gpad_stopped_title(), content: m.gpad_disarmed_body(), type: 'info' });
				}
			);
			notify({ title: m.gpad_active_title(), content: data.message ?? m.gpad_msp_active_body(), type: 'info' });
		}
	});
}

function openConnectDialog(): void {
	let closed = false;
	const close = () => {
		if (closed) return;
		closed = true;
		unmount(instance);
	};
	const instance = mount(GamepadConnect, {
		target: overlayTarget(),
		props: {
			onStart: () => {
				close();
				start();
			},
			onCancel: close
		}
	});
}

export function toggleGamepad(): void {
	if (get(gamepadActiveStore)) {
		stop?.();
		return;
	}
	if (start()) return;
	openConnectDialog();
}
