import { SerialPort } from 'serialport';
import { connect, type Socket } from 'net';
import { building } from '$app/environment';
import {
	MSP,
	MSP_REBOOT_BOOTLOADER,
	MspParser,
	encodeMspV1,
	encodeMspV2,
	encodeSetWaypoint,
	encodeSetRawRc,
	encodeSetModeRange,
	encodeGetSetting,
	encodeSetSetting,
	INAV_RECEIVER_MSP,
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
	decodeBoxNames,
	decodeBoxIds,
	decodeModeRanges,
	type InavWaypoint,
	type ModeRange,
	type MspFrame
} from '../msp';
import type { ModeAssignment } from '../inav-mission';

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
// probing GPS so later polls stay fast. One timeout on a busy link must not
// hide a live GPS forever, so the probe retries after a pause. Reset when the
// link is torn down.
let gpsPresent = true;
let gpsRetryAt = 0;
const GPS_RETRY_MS = 10_000;

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
// hold the port. A reply over 255 bytes (the box-name table on INAV) cannot fit
// an MSP v1 size byte, so those commands are requested over MSP v2, whose size is
// 16-bit; the FC answers in the version it was asked in.
async function request(cmd: number, payload: number[] = [], v2 = false): Promise<MspFrame> {
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
				send(v2 ? encodeMspV2(cmd, payload) : encodeMspV1(cmd, payload));
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
	platform: string; // the airframe class: Multirotor, Airplane, Rover, Boat
}

// INAV's flying-platform classes, in the enum order the platform_type setting
// reports. Betaflight has no such setting; it flies multirotors only.
const INAV_PLATFORMS = ['Multirotor', 'Airplane', 'Helicopter', 'Tricopter', 'Rover', 'Boat'];

async function readPlatform(firmware: FcIdentity['firmware']): Promise<string> {
	if (firmware === 'Betaflight') return 'Multirotor';
	if (firmware !== 'INAV') return '';
	try {
		const raw = await getSetting('platform_type');
		return raw.length ? (INAV_PLATFORMS[raw[0]] ?? 'Multirotor') : 'Multirotor';
	} catch {
		return '';
	}
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
	const firmware = FIRMWARE_NAMES[variant] ?? 'Unknown';
	return {
		variant,
		firmware,
		version: decodeFcVersion(versionFrame.payload) ?? '0.0.0',
		apiVersion: api ? `${api.major}.${api.minor}` : '0.0',
		boardIdentifier: board.boardIdentifier,
		targetName: board.targetName,
		boardName: board.boardName,
		platform: await readPlatform(firmware)
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
	if (!gpsPresent && Date.now() >= gpsRetryAt) gpsPresent = true;
	const [attitude, gps, analog, altitude, status] = await Promise.all([
		read(MSP.ATTITUDE, decodeAttitude),
		gpsPresent ? read(MSP.RAW_GPS, decodeRawGps) : Promise.resolve(null),
		read(MSP.ANALOG, decodeAnalog),
		read(MSP.ALTITUDE, decodeAltitude),
		read(MSP.STATUS, decodeStatus)
	]);
	if (gpsPresent && gps === null) {
		gpsPresent = false;
		gpsRetryAt = Date.now() + GPS_RETRY_MS;
	}
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

export interface ModeConfig {
	names: string[];
	ids: number[];
	ranges: ModeRange[];
}

// Reads the flight-mode boxes this board exposes and the aux-channel ranges that
// activate them. INAV activates a mode only when its aux channel sits inside a
// range, so a station reads these to learn which channel to drive to arm and to
// turn on NAV WP for a mission.
export async function readModeConfig(): Promise<ModeConfig> {
	const [names, ids, ranges] = await Promise.all([
		request(MSP.BOXNAMES, [], true).then((f) => decodeBoxNames(f.payload)),
		request(MSP.BOXIDS, [], true).then((f) => decodeBoxIds(f.payload)),
		request(MSP.MODE_RANGES, [], true).then((f) => decodeModeRanges(f.payload))
	]);
	return { names, ids, ranges };
}

// Assigns an aux channel and window to a flight-mode box. INAV applies the change
// to its running config at once, so the station can enable NAV WP for one flight
// without a permanent write; it reverts on the next power cycle.
export async function setModeRange(a: ModeAssignment): Promise<void> {
	await request(MSP.SET_MODE_RANGE, Array.from(encodeSetModeRange(a.slotIndex, a.permId, a.auxChannel, a.startStep, a.endStep)));
}

// Reads a named setting (MSP v2) as raw little-endian bytes.
export async function getSetting(name: string): Promise<Uint8Array> {
	return (await request(MSP.COMMON_SETTING, Array.from(encodeGetSetting(name)), true)).payload;
}

// Writes a named setting (MSP v2). The value must match the setting's byte width.
export async function setSetting(name: string, value: number[]): Promise<void> {
	await request(MSP.COMMON_SET_SETTING, Array.from(encodeSetSetting(name, value)), true);
}

// Persists the running config to the board's storage.
export async function saveEeprom(): Promise<void> {
	await request(MSP.EEPROM_WRITE);
}

// The station drives the craft over MSP_SET_RAW_RC, which the flight controller
// only applies when its receiver is MSP; otherwise the RC is accepted and dropped,
// so nothing arms or moves. Sets the receiver to MSP once (persisted, one reboot)
// when it is not already, so a station-only board takes its RC from the station.
// Betaflight's receiver is MSP by default and has no receiver_type setting, so
// there is nothing to change there.
export async function ensureMspReceiver(): Promise<{ ok: boolean; changed: boolean; message: string }> {
	try {
		if ((await detectFc()).firmware === 'Betaflight') {
			return { ok: true, changed: false, message: 'Betaflight takes its RC from MSP by default.' };
		}
	} catch {
		// Fall through to the INAV path; a failed detect surfaces there.
	}
	let current: Uint8Array;
	try {
		current = await getSetting('receiver_type');
	} catch (err) {
		return { ok: false, changed: false, message: `Could not read the receiver type: ${(err as Error).message}` };
	}
	if (current.length >= 1 && current[0] === INAV_RECEIVER_MSP) {
		return { ok: true, changed: false, message: 'Receiver is MSP.' };
	}
	try {
		await setSetting('receiver_type', [INAV_RECEIVER_MSP]);
		await saveEeprom();
		try {
			await request(MSP.REBOOT);
		} catch {
			// The board drops the link as it reboots; that is the success case.
		}
		teardown();
	} catch (err) {
		return { ok: false, changed: false, message: `Could not set the receiver to MSP: ${(err as Error).message}` };
	}
	// Wait for the reboot, then reconnect and confirm the receiver took.
	for (let attempt = 0; attempt < 6; attempt++) {
		await new Promise((r) => setTimeout(r, 1000));
		try {
			const after = await getSetting('receiver_type');
			if (after.length >= 1 && after[0] === INAV_RECEIVER_MSP) {
				return { ok: true, changed: true, message: 'Set the receiver to MSP so the station can drive the craft.' };
			}
		} catch {
			// Board still rebooting; retry.
		}
	}
	return { ok: false, changed: true, message: 'Set the receiver to MSP but could not confirm it after the reboot.' };
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

// Runs the sensor calibration MSP boards support: accelerometer (a single level
// calibration, so the board is held flat) and magnetometer (the board collects
// while it is rotated through all axes). Gyro calibrates itself at power-on.
export async function mspCalibrate(kind: string): Promise<{ ok: boolean; message: string }> {
	try {
		if (kind === 'compass') {
			await request(MSP.MAG_CALIBRATION);
			return { ok: true, message: 'Compass calibration started. Rotate the craft through all axes.' };
		}
		if (kind === 'gyro') {
			return { ok: true, message: 'The gyro calibrates automatically at power-on; keep the craft still.' };
		}
		await request(MSP.ACC_CALIBRATION);
		return { ok: true, message: 'Accelerometer calibrated at the level position.' };
	} catch (err) {
		return { ok: false, message: (err as Error).message };
	}
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
