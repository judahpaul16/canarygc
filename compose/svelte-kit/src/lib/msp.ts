// MultiWii Serial Protocol framing and decoding for Betaflight and INAV.
// MSP v1 frames are "$M" + direction + size + command + payload + XOR
// checksum over size, command, and payload. MSP v2 frames are "$X" +
// direction + flag + command (u16 LE) + size (u16 LE) + payload + a
// crc8_dvb_s2 checksum over flag through the final payload byte.

export const MSP = {
	API_VERSION: 1,
	FC_VARIANT: 2,
	FC_VERSION: 3,
	BOARD_INFO: 4,
	BUILD_INFO: 5,
	WP_MISSION_SAVE: 19,
	WP_GETINFO: 20,
	REBOOT: 68,
	STATUS: 101,
	RAW_GPS: 106,
	ATTITUDE: 108,
	ALTITUDE: 109,
	ANALOG: 110,
	WP: 118,
	SET_RAW_RC: 200,
	SET_WP: 209
} as const;

// INAV waypoint actions (navWaypointActions_e). INAV, unlike Betaflight, flies
// autonomous waypoint missions, and the mission uploads over MSP with SET_WP.
export const NAV_WP_ACTION = {
	WAYPOINT: 1,
	POSHOLD_UNLIM: 2,
	POSHOLD_TIME: 3,
	RTH: 4,
	SET_POI: 5,
	JUMP: 6,
	SET_HEAD: 7,
	LAND: 8
} as const;

// The flag byte on the last waypoint of a mission.
export const MSP_WP_LAST = 0xa5;

// Payload byte for MSP.REBOOT selecting the STM32 ROM bootloader (DFU mode).
export const MSP_REBOOT_BOOTLOADER = 1;

export interface MspFrame {
	version: 1 | 2;
	cmd: number;
	payload: Uint8Array;
	error: boolean;
}

export function crc8DvbS2(bytes: Uint8Array | number[], seed = 0): number {
	let crc = seed;
	for (const byte of bytes) {
		crc ^= byte;
		for (let i = 0; i < 8; i++) {
			crc = crc & 0x80 ? ((crc << 1) ^ 0xd5) & 0xff : (crc << 1) & 0xff;
		}
	}
	return crc;
}

export function encodeMspV1(cmd: number, payload: Uint8Array | number[] = []): Uint8Array {
	const data = Uint8Array.from(payload);
	const frame = new Uint8Array(6 + data.length);
	frame[0] = 0x24; // $
	frame[1] = 0x4d; // M
	frame[2] = 0x3c; // <
	frame[3] = data.length;
	frame[4] = cmd;
	frame.set(data, 5);
	let checksum = frame[3] ^ frame[4];
	for (const byte of data) checksum ^= byte;
	frame[frame.length - 1] = checksum;
	return frame;
}

export function encodeMspV2(cmd: number, payload: Uint8Array | number[] = [], flag = 0): Uint8Array {
	const data = Uint8Array.from(payload);
	const frame = new Uint8Array(9 + data.length);
	frame[0] = 0x24; // $
	frame[1] = 0x58; // X
	frame[2] = 0x3c; // <
	frame[3] = flag;
	frame[4] = cmd & 0xff;
	frame[5] = (cmd >> 8) & 0xff;
	frame[6] = data.length & 0xff;
	frame[7] = (data.length >> 8) & 0xff;
	frame.set(data, 8);
	frame[frame.length - 1] = crc8DvbS2(frame.subarray(3, frame.length - 1));
	return frame;
}

// Incremental parser: feed arbitrary byte chunks, collect complete frames.
// Both response ('>') and error ('!') directions are surfaced; anything that
// fails a checksum or is not MSP resynchronizes on the next '$'.
export class MspParser {
	private buffer: number[] = [];

	feed(chunk: Uint8Array): MspFrame[] {
		const frames: MspFrame[] = [];
		for (const byte of chunk) this.buffer.push(byte);
		let progressed = true;
		while (progressed) {
			progressed = false;
			const start = this.buffer.indexOf(0x24);
			if (start === -1) {
				this.buffer.length = 0;
				break;
			}
			if (start > 0) this.buffer.splice(0, start);
			if (this.buffer.length < 3) break;
			const kind = this.buffer[1];
			const dir = this.buffer[2];
			const isResponse = dir === 0x3e || dir === 0x21; // > or !
			if (kind === 0x4d && isResponse) {
				if (this.buffer.length < 6) break;
				const size = this.buffer[3];
				const total = 6 + size;
				if (this.buffer.length < total) break;
				const frame = this.buffer.slice(0, total);
				this.buffer.splice(0, total);
				progressed = true;
				let checksum = frame[3] ^ frame[4];
				for (let i = 5; i < 5 + size; i++) checksum ^= frame[i];
				if (checksum === frame[total - 1]) {
					frames.push({
						version: 1,
						cmd: frame[4],
						payload: Uint8Array.from(frame.slice(5, 5 + size)),
						error: dir === 0x21
					});
				}
			} else if (kind === 0x58 && isResponse) {
				if (this.buffer.length < 9) break;
				const size = this.buffer[6] | (this.buffer[7] << 8);
				const total = 9 + size;
				if (this.buffer.length < total) break;
				const frame = this.buffer.slice(0, total);
				this.buffer.splice(0, total);
				progressed = true;
				const crc = crc8DvbS2(Uint8Array.from(frame.slice(3, total - 1)));
				if (crc === frame[total - 1]) {
					frames.push({
						version: 2,
						cmd: frame[4] | (frame[5] << 8),
						payload: Uint8Array.from(frame.slice(8, 8 + size)),
						error: dir === 0x21
					});
				}
			} else {
				// Not an MSP response header; drop the '$' and resync.
				this.buffer.splice(0, 1);
				progressed = true;
			}
		}
		return frames;
	}
}

function view(payload: Uint8Array): DataView {
	return new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
}

export function decodeApiVersion(payload: Uint8Array): { protocol: number; major: number; minor: number } | null {
	if (payload.length < 3) return null;
	return { protocol: payload[0], major: payload[1], minor: payload[2] };
}

export function decodeFcVariant(payload: Uint8Array): string | null {
	if (payload.length < 4) return null;
	return String.fromCharCode(...payload.subarray(0, 4));
}

export function decodeFcVersion(payload: Uint8Array): string | null {
	if (payload.length < 3) return null;
	return `${payload[0]}.${payload[1]}.${payload[2]}`;
}

// MSP_BOARD_INFO: a 4-char board identifier and a U16 board version, then, on
// modern Betaflight and INAV, a board-type byte, a capabilities byte, and
// length-prefixed target name, board name, and manufacturer id. The target
// name is the value that matches a firmware catalog target. Reads defensively
// so a short or old payload still yields whatever fields it carries.
export function decodeBoardInfo(
	payload: Uint8Array
): { boardIdentifier: string; targetName: string; boardName: string } | null {
	if (payload.length < 6) return null;
	const boardIdentifier = String.fromCharCode(...payload.subarray(0, 4)).replace(/\0+$/, '');
	let offset = 6;
	const readString = (): string => {
		if (offset >= payload.length) return '';
		const len = payload[offset++];
		if (len === 0 || offset + len > payload.length) return '';
		const s = String.fromCharCode(...payload.subarray(offset, offset + len));
		offset += len;
		return s;
	};
	offset += 2; // boardType, targetCapabilities
	const targetName = readString();
	const boardName = readString();
	return { boardIdentifier, targetName, boardName };
}

export function decodeAttitude(payload: Uint8Array): { rollDeg: number; pitchDeg: number; yawDeg: number } | null {
	if (payload.length < 6) return null;
	const v = view(payload);
	return {
		rollDeg: v.getInt16(0, true) / 10,
		pitchDeg: v.getInt16(2, true) / 10,
		yawDeg: v.getInt16(4, true)
	};
}

export function decodeRawGps(payload: Uint8Array): {
	fix: number;
	numSat: number;
	lat: number;
	lon: number;
	altM: number;
	speedMs: number;
	courseDeg: number;
	hdop: number | null;
} | null {
	if (payload.length < 16) return null;
	const v = view(payload);
	return {
		fix: v.getUint8(0),
		numSat: v.getUint8(1),
		lat: v.getInt32(2, true) / 1e7,
		lon: v.getInt32(6, true) / 1e7,
		altM: v.getUint16(10, true),
		speedMs: v.getUint16(12, true) / 100,
		courseDeg: v.getUint16(14, true) / 10,
		hdop: payload.length >= 18 ? v.getUint16(16, true) / 100 : null
	};
}

export function decodeAnalog(payload: Uint8Array): {
	voltageV: number;
	mahDrawn: number;
	rssi: number;
	amps: number;
} | null {
	if (payload.length < 7) return null;
	const v = view(payload);
	return {
		// Betaflight appends a U16 0.01V reading after the legacy fields; the
		// legacy U8 (0.1V) caps at 25.5V, so prefer the wide field for high-cell
		// packs and fall back to the legacy byte on older firmware.
		voltageV: payload.length >= 9 ? v.getUint16(7, true) / 100 : v.getUint8(0) / 10,
		mahDrawn: v.getUint16(1, true),
		rssi: v.getUint16(3, true),
		amps: v.getInt16(5, true) / 100
	};
}

export function decodeAltitude(payload: Uint8Array): { altM: number; varioMs: number } | null {
	if (payload.length < 6) return null;
	const v = view(payload);
	return { altM: v.getInt32(0, true) / 100, varioMs: v.getInt16(4, true) / 100 };
}

// MSP_STATUS: cycle time, I2C errors, and a sensor bitmask, then a U32 of active
// mode-box flags whose lowest bit is the ARM box. Only the armed state is read;
// full flight-mode names need the box-name table, which the dashboard does not
// use.
export function decodeStatus(payload: Uint8Array): { armed: boolean } | null {
	if (payload.length < 10) return null;
	return { armed: (view(payload).getUint32(6, true) & 1) !== 0 };
}

export interface InavWaypoint {
	index: number; // 1-based waypoint number
	action: number; // NAV_WP_ACTION code
	lat: number; // degrees
	lon: number; // degrees
	altM: number; // meters, relative to home
	p1?: number;
	p2?: number;
	p3?: number;
	last?: boolean;
}

// MSP_SET_WP payload: a packed 21-byte struct (little-endian) of
// { u8 wp_no, u8 action, i32 lat*1e7, i32 lon*1e7, i32 alt_cm, i16 p1, i16 p2,
// i16 p3, u8 flag }. The flag is 0xA5 on the final waypoint, 0 otherwise.
export function encodeSetWaypoint(wp: InavWaypoint): Uint8Array {
	const buf = new Uint8Array(21);
	const v = new DataView(buf.buffer);
	v.setUint8(0, wp.index);
	v.setUint8(1, wp.action);
	v.setInt32(2, Math.round(wp.lat * 1e7), true);
	v.setInt32(6, Math.round(wp.lon * 1e7), true);
	v.setInt32(10, Math.round(wp.altM * 100), true);
	v.setInt16(14, wp.p1 ?? 0, true);
	v.setInt16(16, wp.p2 ?? 0, true);
	v.setInt16(18, wp.p3 ?? 0, true);
	v.setUint8(20, wp.last ? MSP_WP_LAST : 0);
	return buf;
}

// MSP_SET_RAW_RC payload: each RC channel as a u16 (microseconds) little-endian.
// Betaflight and INAV accept it as an override RC source, which is how the
// companion computer flies a Betaflight board that has no onboard navigation.
export function encodeSetRawRc(channels: number[]): Uint8Array {
	const buf = new Uint8Array(channels.length * 2);
	const v = new DataView(buf.buffer);
	channels.forEach((us, i) => v.setUint16(i * 2, Math.max(0, Math.min(65535, Math.round(us))), true));
	return buf;
}

// Maps a stored MAVLink mission command to its INAV waypoint action, or null
// for commands an INAV mission does not carry (takeoff, servo, condition), so
// the upload skips them.
export function inavActionForType(type: string): number | null {
	switch (type) {
		case 'NAV_WAYPOINT':
		case 'NAV_SPLINE_WAYPOINT':
			return NAV_WP_ACTION.WAYPOINT;
		case 'NAV_RETURN_TO_LAUNCH':
			return NAV_WP_ACTION.RTH;
		case 'NAV_LAND':
		case 'NAV_VTOL_LAND':
			return NAV_WP_ACTION.LAND;
		case 'NAV_LOITER_UNLIM':
			return NAV_WP_ACTION.POSHOLD_UNLIM;
		case 'NAV_LOITER_TIME':
			return NAV_WP_ACTION.POSHOLD_TIME;
		default:
			return null;
	}
}
