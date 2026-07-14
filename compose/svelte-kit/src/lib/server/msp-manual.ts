// Manual gamepad flight for an MSP board. The station is the craft's receiver
// (no transmitter), so it both arms the craft and flies it over MSP_SET_RAW_RC:
// it makes sure the board takes its RC from MSP, resolves the aux channel that
// arms, then streams sticks with the arm channel held low for a moment and then
// high, the same order a transmitter arm switch follows. Stick flying needs no
// GPS or position estimate, so this is how a no-GPS Betaflight or INAV craft flies
// from the station.
import { building } from '$app/environment';
import { sendRawRc, ensureMspReceiver, readModeConfig, setModeRange, mspConfigured, setRcOverrideActive } from './msp';
import { resolveArmChannel, buildManualRcFrame, type ArmChannel } from '../inav-mission';
import { DEFAULT_GUIDANCE_CONFIG } from '../msp-guidance';

// The arm channel is held low this long after starting so the flight controller
// sees it transition low then high; INAV and Betaflight refuse to arm on a switch
// that was already high when RC was acquired.
const ARM_SETTLE_MS = 1200;

interface ManualSession {
	active: boolean;
	arm: ArmChannel | null;
	startedAt: number;
}

const g = globalThis as typeof globalThis & { __canarygcMspManual?: ManualSession };
const session: ManualSession = (g.__canarygcMspManual ??= { active: false, arm: null, startedAt: 0 });

// Prepares the board for station flight: makes MSP the receiver so the sticks
// reach the flight controller, then resolves (or assigns) the aux channel that
// arms. Both must hold before any stick can move or arm the craft.
export async function startMspManual(): Promise<{ ok: boolean; message: string }> {
	if (building || !mspConfigured()) return { ok: false, message: 'No flight controller is configured.' };

	const rx = await ensureMspReceiver();
	if (!rx.ok) return { ok: false, message: rx.message };

	try {
		const mode = await readModeConfig();
		const arm = resolveArmChannel(mode);
		if (arm.assignment) await setModeRange(arm.assignment);
		session.arm = arm;
		session.startedAt = Date.now();
		session.active = true;
		setRcOverrideActive(true);
	} catch (err) {
		return { ok: false, message: `Could not set up the arm channel: ${(err as Error).message}` };
	}
	const note = rx.changed ? ' Set the receiver to MSP for station control.' : '';
	return { ok: true, message: `Gamepad flight ready.${note} Keep the throttle down until you are ready to arm.` };
}

// Maps one gamepad stick frame to an MSP RC frame and streams it. Roll, pitch, and
// yaw come from the sticks around center; throttle passes straight through; the arm
// channel settles low, then holds high so the craft arms once throttle is low.
export async function sendMspManualFrame(frame: { x: number; y: number; z: number; r: number }): Promise<void> {
	const g = DEFAULT_GUIDANCE_CONFIG;
	const stick = (v: number, sign: number) => g.centerUs + sign * Math.max(-500, Math.min(500, (v / 1000) * 500));
	const roll = stick(frame.y, g.rollSign);
	const pitch = stick(frame.x, g.pitchSign);
	const yaw = stick(frame.r, g.yawSign);
	const throttle = 1000 + Math.max(0, Math.min(1000, frame.z));

	if (!session.active || !session.arm) {
		await sendRawRc([roll, pitch, throttle, yaw, 1000, 1000, 1000, 1000]);
		return;
	}
	const armed = Date.now() - session.startedAt >= ARM_SETTLE_MS;
	await sendRawRc(
		buildManualRcFrame({
			armAux: session.arm.armAux,
			armUs: session.arm.armUs,
			channelCount: session.arm.channelCount,
			roll,
			pitch,
			yaw,
			throttleUs: throttle,
			armed
		})
	);
}

// Disarms and ends the session: one frame with the arm channel low and throttle
// low, then the stream stops and the flight controller's own RX failsafe holds.
export async function stopMspManual(): Promise<void> {
	const arm = session.arm;
	if (session.active) setRcOverrideActive(false);
	session.active = false;
	session.arm = null;
	if (!arm) return;
	try {
		await sendRawRc(
			buildManualRcFrame({
				armAux: arm.armAux,
				armUs: arm.armUs,
				channelCount: arm.channelCount,
				roll: DEFAULT_GUIDANCE_CONFIG.centerUs,
				pitch: DEFAULT_GUIDANCE_CONFIG.centerUs,
				yaw: DEFAULT_GUIDANCE_CONFIG.centerUs,
				throttleUs: 1000,
				armed: false
			})
		);
	} catch {
		// The stream stops regardless; the FC failsafe takes it from here.
	}
}

export function mspManualActive(): boolean {
	return session.active;
}
