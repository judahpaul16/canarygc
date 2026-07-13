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
	REBOOT: 68,
	STATUS: 101,
	RAW_GPS: 106,
	ATTITUDE: 108,
	ALTITUDE: 109,
	ANALOG: 110
} as const;

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
		voltageV: v.getUint8(0) / 10,
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
