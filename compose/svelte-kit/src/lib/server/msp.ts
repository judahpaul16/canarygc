import { SerialPort } from 'serialport';
import { connect, type Socket } from 'net';
import { building } from '$app/environment';
import {
	MSP,
	MSP_REBOOT_BOOTLOADER,
	MspParser,
	encodeMspV1,
	encodeSetWaypoint,
	encodeSetRawRc,
	inavActionForType,
	NAV_WP_ACTION,
	decodeApiVersion,
	decodeFcVariant,
	decodeFcVersion,
	decodeBoardInfo,
	decodeAttitude,
	decodeRawGps,
	decodeAnalog,
	decodeAltitude,
	decodeStatus,
	type InavWaypoint,
	type MspFrame
} from '../msp';

// A Betaflight or INAV flight controller speaks MSP over its own serial link,
// separate from the MAVLink autopilot. The path is opt-in through env so it
// never collides with the MAVLink serial: unset means MSP is simply
// unavailable and the FC panel shows as not configured. A dev TCP override
// points the same client at a mock or a serial-over-TCP bridge.
const SERIAL_PATH = process.env.MSP_SERIAL_PATH ?? '';
const BAUD = Number(process.env.MSP_BAUD ?? 115200);
const TCP_HOST = process.env.MSP_TCP_HOST ?? '';
const TCP_PORT = Number(process.env.MSP_TCP_PORT ?? 0);

const REQUEST_TIMEOUT_MS = 2000;
const IDLE_CLOSE_MS = 20_000;

interface PendingRequest {
	cmd: number;
	resolve: (frame: MspFrame) => void;
	reject: (err: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

interface MspState {
	port: SerialPort | Socket | null;
	parser: MspParser;
	queue: Array<() => void>;
	pending: PendingRequest | null;
	idleTimer: ReturnType<typeof setTimeout> | null;
}

const g = globalThis as typeof globalThis & { __canarygcMsp?: MspState };
const state: MspState = (g.__canarygcMsp ??= {
	port: null,
	parser: new MspParser(),
	queue: [],
	pending: null,
	idleTimer: null
});

export function mspConfigured(): boolean {
	return Boolean(SERIAL_PATH || (TCP_HOST && TCP_PORT));
}

// A board with no GPS times out the RAW_GPS read; once it does, telemetry stops
// probing GPS so later polls stay fast. Reset when the link is torn down.
let gpsPresent = true;

function teardown(err?: Error): void {
	if (state.pending) {
		clearTimeout(state.pending.timer);
		state.pending.reject(err ?? new Error('FC link closed'));
		state.pending = null;
	}
	const waiting = state.queue.splice(0);
	for (const run of waiting) run();
	if (state.idleTimer) {
		clearTimeout(state.idleTimer);
		state.idleTimer = null;
	}
	if (state.port) {
		state.port.removeAllListeners();
		state.port.destroy();
		state.port = null;
	}
	state.parser = new MspParser();
	gpsPresent = true;
}

function open(): Promise<void> {
	if (state.port) return Promise.resolve();
	if (building || !mspConfigured()) return Promise.reject(new Error('No flight controller configured'));
	return new Promise((resolve, reject) => {
		let settled = false;
		const done = (err?: Error) => {
			if (settled) return;
			settled = true;
			if (err) {
				teardown(err);
				reject(err);
			} else {
				resolve();
			}
		};
		try {
			if (TCP_HOST && TCP_PORT) {
				const socket = connect({ host: TCP_HOST, port: TCP_PORT }, () => done());
				socket.setNoDelay(true);
				state.port = socket;
			} else {
				const serial = new SerialPort({ path: SERIAL_PATH, baudRate: BAUD, lock: false }, (err) =>
					done(err ?? undefined)
				);
				state.port = serial;
			}
			state.port.on('data', (chunk: Buffer) => onData(chunk));
			state.port.on('error', (err: Error) => done(err));
			state.port.on('close', () => teardown(new Error('FC link closed')));
		} catch (err) {
			done(err as Error);
		}
	});
}

function onData(chunk: Buffer): void {
	const frames = state.parser.feed(Uint8Array.from(chunk));
	for (const frame of frames) {
		const pending = state.pending;
		if (pending && (frame.cmd === pending.cmd || frame.error)) {
			clearTimeout(pending.timer);
			state.pending = null;
			pending.resolve(frame);
			const next = state.queue.shift();
			if (next) next();
		}
	}
}

function send(bytes: Uint8Array): void {
	(state.port as SerialPort | Socket).write(Buffer.from(bytes));
}

// MSP has no sequence numbers, so requests run one at a time: each waits its
// turn in the queue, sends, and resolves on the matching response or an error
// frame. An idle timer closes the link so a plugged-and-forgotten FC does not
// hold the port.
async function request(cmd: number, payload: number[] = []): Promise<MspFrame> {
	await open();
	if (state.idleTimer) clearTimeout(state.idleTimer);
	state.idleTimer = setTimeout(() => teardown(), IDLE_CLOSE_MS);

	return new Promise<MspFrame>((resolve, reject) => {
		const run = () => {
			state.pending = {
				cmd,
				resolve,
				reject,
				timer: setTimeout(() => {
					state.pending = null;
					reject(new Error(`MSP request ${cmd} timed out`));
					const next = state.queue.shift();
					if (next) next();
				}, REQUEST_TIMEOUT_MS)
			};
			try {
				send(encodeMspV1(cmd, payload));
			} catch (err) {
				clearTimeout(state.pending.timer);
				state.pending = null;
				reject(err as Error);
			}
		};
		if (state.pending) state.queue.push(run);
		else run();
	});
}

export interface FcIdentity {
	variant: string;
	firmware: 'Betaflight' | 'INAV' | 'Cleanflight' | 'Unknown';
	version: string;
	apiVersion: string;
	boardIdentifier: string;
	targetName: string;
	boardName: string;
}

const FIRMWARE_NAMES: Record<string, FcIdentity['firmware']> = {
	BTFL: 'Betaflight',
	INAV: 'INAV',
	CLFL: 'Cleanflight'
};

export async function detectFc(): Promise<FcIdentity> {
	const [variantFrame, versionFrame, apiFrame] = await Promise.all([
		request(MSP.FC_VARIANT),
		request(MSP.FC_VERSION),
		request(MSP.API_VERSION)
	]);

	let board = { boardIdentifier: '', targetName: '', boardName: '' };
	try {
		const boardFrame = await request(MSP.BOARD_INFO);
		board = decodeBoardInfo(boardFrame.payload) ?? board;
	} catch {
		// Older firmware may not answer BOARD_INFO; identity still resolves.
	}

	const variant = decodeFcVariant(variantFrame.payload) ?? 'Unknown';
	const api = decodeApiVersion(apiFrame.payload);
	return {
		variant,
		firmware: FIRMWARE_NAMES[variant] ?? 'Unknown',
		version: decodeFcVersion(versionFrame.payload) ?? '0.0.0',
		apiVersion: api ? `${api.major}.${api.minor}` : '0.0',
		boardIdentifier: board.boardIdentifier,
		targetName: board.targetName,
		boardName: board.boardName
	};
}

export interface FcTelemetry {
	attitude: ReturnType<typeof decodeAttitude>;
	gps: ReturnType<typeof decodeRawGps>;
	analog: ReturnType<typeof decodeAnalog>;
	altitude: ReturnType<typeof decodeAltitude>;
	status: ReturnType<typeof decodeStatus>;
}

export async function readTelemetry(): Promise<FcTelemetry> {
	// A sensor the board lacks (GPS on a bench flight controller) times out, so
	// each command is read on its own; a missing one returns null instead of
	// failing every other reading.
	const read = async <T>(cmd: number, decode: (p: Uint8Array) => T): Promise<T | null> => {
		try {
			return decode((await request(cmd)).payload);
		} catch {
			return null;
		}
	};
	const [attitude, gps, analog, altitude, status] = await Promise.all([
		read(MSP.ATTITUDE, decodeAttitude),
		gpsPresent ? read(MSP.RAW_GPS, decodeRawGps) : Promise.resolve(null),
		read(MSP.ANALOG, decodeAnalog),
		read(MSP.ALTITUDE, decodeAltitude),
		read(MSP.STATUS, decodeStatus)
	]);
	if (gpsPresent && gps === null) gpsPresent = false;
	return { attitude, gps, analog, altitude, status };
}

// Streams an RC channel frame to the board. Companion-side guidance sends these
// at a fixed rate to fly a Betaflight craft that has no onboard navigation.
export async function sendRawRc(channels: number[]): Promise<void> {
	await request(MSP.SET_RAW_RC, Array.from(encodeSetRawRc(channels)));
}

export interface NavState {
	gps: ReturnType<typeof decodeRawGps>;
	attitude: ReturnType<typeof decodeAttitude>;
	altitude: ReturnType<typeof decodeAltitude>;
}

// Reads position, attitude, and altitude in one round for the guidance loop.
// Unlike readTelemetry it always probes GPS, since guidance needs a live fix
// and stops when the fix is lost.
export async function readNavState(): Promise<NavState> {
	const read = async <T>(cmd: number, decode: (p: Uint8Array) => T): Promise<T | null> => {
		try {
			return decode((await request(cmd)).payload);
		} catch {
			return null;
		}
	};
	const [gps, attitude, altitude] = await Promise.all([
		read(MSP.RAW_GPS, decodeRawGps),
		read(MSP.ATTITUDE, decodeAttitude),
		read(MSP.ALTITUDE, decodeAltitude)
	]);
	return { gps, attitude, altitude };
}

export interface MspMissionItem {
	type: string;
	lat: number;
	lon: number;
	alt: number | null;
}

// Uploads a mission to an INAV flight controller over MSP. Each waypoint is a
// MSP_SET_WP frame the FC acknowledges before the next is sent; INAV holds the
// uploaded mission in RAM and flies it in NAV WP mode, and a best-effort
// WP_MISSION_SAVE persists it so it survives a power cycle. Betaflight answers
// none of this (it has no waypoint navigation), so the caller only routes here
// for INAV.
export async function uploadMissionMsp(
	items: MspMissionItem[]
): Promise<{ ok: boolean; message: string; count: number }> {
	const waypoints: InavWaypoint[] = [];
	for (const item of items) {
		const action = inavActionForType(item.type);
		if (action === null) continue; // takeoff, servo, condition: not a WP action
		const positional = action === NAV_WP_ACTION.WAYPOINT;
		if (positional && item.lat === 0 && item.lon === 0) continue;
		waypoints.push({
			index: waypoints.length + 1,
			action,
			lat: item.lat,
			lon: item.lon,
			altM: item.alt ?? 0
		});
	}

	if (waypoints.length === 0) {
		return { ok: false, message: 'Mission has no waypoints INAV can fly.', count: 0 };
	}
	waypoints[waypoints.length - 1].last = true;

	// WP_GETINFO reports the board's waypoint capacity (byte 1); refuse a mission
	// that would overflow it rather than upload a truncated one.
	try {
		const info = (await request(MSP.WP_GETINFO)).payload;
		const maxWaypoints = info.length >= 2 ? info[1] : 0;
		if (maxWaypoints > 0 && waypoints.length > maxWaypoints) {
			return {
				ok: false,
				message: `Mission has ${waypoints.length} waypoints but the board holds ${maxWaypoints}.`,
				count: 0
			};
		}
	} catch {
		// Older firmware may not answer WP_GETINFO; upload anyway.
	}

	for (const wp of waypoints) {
		await request(MSP.SET_WP, Array.from(encodeSetWaypoint(wp)));
	}

	try {
		await request(MSP.WP_MISSION_SAVE);
	} catch {
		// Saving to onboard storage is best-effort; the RAM mission still flies.
	}

	return { ok: true, message: `Uploaded ${waypoints.length} waypoints to the flight controller.`, count: waypoints.length };
}

// Drops the FC into its ROM bootloader so a DFU flash can follow. The FC
// disconnects as it reboots, so a lack of response is the success case.
export async function rebootToBootloader(): Promise<void> {
	try {
		await request(MSP.REBOOT, [MSP_REBOOT_BOOTLOADER]);
	} catch {
		// The controller drops the link mid-reboot; that is expected.
	}
	teardown();
}
