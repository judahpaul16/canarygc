// Sends one gamepad stick frame to the connected flight controller over its own
// protocol: MANUAL_CONTROL on a MAVLink autopilot, RC override on an MSP board.
// Manual stick flying needs no GPS or position estimate, so it is how a no-GPS
// Betaflight or INAV craft flies from the station.
import { get } from 'svelte/store';
import { fcProtocolStore, mavArmedStateStore } from '../stores/mavlinkStore';
import { sendManualControl } from './mavlink-client';
import type { StickFrame } from './gamepad-control';

export function manualTransportIsMsp(): boolean {
	return get(fcProtocolStore) === 'msp';
}

export async function sendManualFrame(frame: StickFrame): Promise<void> {
	if (get(fcProtocolStore) === 'msp') {
		await fetch('/api/msp/manual_control', {
			method: 'POST',
			headers: {
				x: String(frame.x),
				y: String(frame.y),
				z: String(frame.z),
				r: String(frame.r),
				armed: String(get(mavArmedStateStore))
			}
		}).catch(() => {});
		return;
	}
	await sendManualControl(frame);
}
