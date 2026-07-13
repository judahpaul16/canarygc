// Maps a standard-layout gamepad onto MAVLink MANUAL_CONTROL axes (Mode 2:
// left stick throttle and yaw, right stick pitch and roll) and streams frames
// at a fixed rate. x, y, and r normalize to the message's -1000..1000 range
// with a deadzone so a centered stick reads exactly neutral. z (thrust) is
// 0..1000 with 500 at stick center: ArduPilot maps it onto the throttle
// channel's 0..1000 override and drops any frame with negative z, and PX4
// computes throttle as (z / 1000) * 2 - 1, so both stacks hover on 500.
export interface StickFrame {
	x: number;
	y: number;
	z: number;
	r: number;
	buttons: number;
}

const AXIS_RANGE = 1000;
const THRUST_CENTER = 500;
const DEADZONE = 0.08;
export const MANUAL_CONTROL_HZ = 20;

function deadzoned(value: number | undefined): number {
	const v = value ?? 0;
	if (Math.abs(v) < DEADZONE) return 0;
	// Rescale outside the deadzone so output still spans the full range.
	const scaled = (Math.abs(v) - DEADZONE) / (1 - DEADZONE);
	return Math.sign(v) * Math.min(1, scaled);
}

function axis(value: number | undefined): number {
	return Math.round(deadzoned(value) * AXIS_RANGE);
}

function thrust(value: number | undefined): number {
	return Math.round((deadzoned(value) + 1) * THRUST_CENTER);
}

export function mapGamepad(pad: Pick<Gamepad, 'axes' | 'buttons'>): StickFrame {
	let buttons = 0;
	for (let i = 0; i < Math.min(16, pad.buttons.length); i++) {
		if (pad.buttons[i]?.pressed) buttons |= 1 << i;
	}
	return {
		// Stick up reads as a negative browser axis; pitch forward is +1000.
		x: axis(-(pad.axes[3] ?? 0)),
		y: axis(pad.axes[2] ?? 0),
		z: thrust(-(pad.axes[1] ?? 0)),
		r: axis(pad.axes[0] ?? 0),
		buttons
	};
}

export function firstGamepad(): Gamepad | null {
	if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
	for (const pad of navigator.getGamepads()) {
		if (pad && pad.connected) return pad;
	}
	return null;
}

// Streams mapped frames until stopped; the caller owns transport and UI. When
// the pad disappears the loop reports it and stops rather than sending stale
// neutral frames, so the vehicle's own link-loss handling takes over.
export function startGamepadLoop(
	send: (frame: StickFrame) => void,
	onEnd: (reason: 'stopped' | 'disconnected') => void
): () => void {
	let active = true;
	const timer = setInterval(() => {
		if (!active) return;
		const pad = firstGamepad();
		if (!pad) {
			active = false;
			clearInterval(timer);
			onEnd('disconnected');
			return;
		}
		send(mapGamepad(pad));
	}, 1000 / MANUAL_CONTROL_HZ);
	return () => {
		if (!active) return;
		active = false;
		clearInterval(timer);
		onEnd('stopped');
	};
}
