import { get, writable } from 'svelte/store';
import { mount, unmount } from 'svelte';
import { firstGamepad, startGamepadLoop } from './gamepad-control';
import { setFlightMode } from './mavlink-client';
import { sendManualFrame, manualTransportIsMsp } from './manual-transport';
import { isPX4, isPlane } from './flight-modes';
import { mavArmedStateStore } from '../stores/mavlinkStore';
import { notify, overlayTarget, showModal } from './overlays';
import GamepadConnect from '../components/GamepadConnect.svelte';

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
		const label = isPX4() ? 'Position' : isPlane() ? 'Cruise' : 'Loiter';
		const behavior = isPlane()
			? 'the stick steers; release to hold heading, altitude, and airspeed'
			: 'sticks steer, centered sticks hold position';
		notify({
			title: 'Gamepad flight active',
			content: `Flying in ${label} mode: ${behavior}. A running mission is paused until resumed.`,
			type: 'info'
		});
		return;
	}
	if (attempt < 2) {
		setTimeout(() => void enterStickMode(attempt + 1), MODE_SWITCH_RETRY_MS);
		return;
	}
	notify({
		title: 'Mode switch rejected',
		content: 'The vehicle refused its stick-flying mode; the gamepad stream continues in the current mode.',
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
			title: 'Gamepad flight stopped',
			content: 'The vehicle is holding position; fly from the app controls or resume the mission.',
			type: 'info'
		});
	}
	if (reason === 'disconnected') {
		notify({ title: 'Gamepad disconnected', content: 'The stick stream stopped.', type: 'warning' });
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
			title: 'Gamepad streaming',
			content: 'Input is reaching the vehicle. Stick flying engages automatically once it is armed.',
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
		title: 'Fly by gamepad over MSP',
		content:
			'The station arms and flies this craft by stick over MSP; no GPS needed. The motors spin when it arms, so keep the throttle down until you are ready.',
		confirmation: true,
		confirmLabel: 'Arm and fly',
		inputs: [{ type: 'checkbox', placeholder: 'Props are clear and I am ready to arm', required: true }],
		onConfirm: async (values) => {
			if (values[0] !== 'true') return;
			gamepadActiveStore.set(true);
			notify({ title: 'Gamepad flight', content: 'Preparing the flight controller for station control.', type: 'info' });
			let data: { ok?: boolean; message?: string; error?: string };
			try {
				const res = await fetch('/api/msp/manual_start', { method: 'POST' });
				data = await res.json();
				if (!res.ok) {
					showModal({
						title: 'Gamepad flight failed',
						content: data.message ?? data.error ?? 'The flight controller rejected station control.',
						notification: true
					});
					gamepadActiveStore.set(false);
					return;
				}
			} catch (error) {
				showModal({ title: 'Gamepad flight failed', content: (error as Error).message, notification: true });
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
					notify({ title: 'Gamepad flight stopped', content: 'Disarmed; control released to the flight controller.', type: 'info' });
				}
			);
			notify({ title: 'Gamepad flight active', content: data.message ?? 'Sticks fly the craft; raise the throttle to take off.', type: 'info' });
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
