import { describe, expect, it } from 'vitest';
import {
	MSP,
	MspParser,
	crc8DvbS2,
	encodeMspV1,
	encodeMspV2,
	decodeApiVersion,
	decodeFcVariant,
	decodeFcVersion,
	decodeBoardInfo,
	decodeAttitude,
	decodeRawGps,
	decodeAnalog,
	decodeAltitude,
	decodeStatus
} from './msp';

function buildBoardInfo(id: string, target: string, board: string): Uint8Array {
	const enc = new TextEncoder();
	const t = enc.encode(target);
	const b = enc.encode(board);
	const bytes = [...enc.encode(id), 0, 0, 2, 0, t.length, ...t, b.length, ...b];
	return new Uint8Array(bytes);
}

describe('MSP framing', () => {
	it('encodes an empty MSP v1 request with an XOR checksum', () => {
		// $ M < size=0 cmd=1 checksum=(0^1)
		const frame = encodeMspV1(MSP.API_VERSION);
		expect([...frame]).toEqual([0x24, 0x4d, 0x3c, 0x00, 0x01, 0x01]);
	});

	it('XORs size, command, and payload for the v1 checksum', () => {
		const frame = encodeMspV1(200, [1, 2, 3]);
		const expected = 3 ^ 200 ^ 1 ^ 2 ^ 3;
		expect(frame[frame.length - 1]).toBe(expected);
	});

	it('encodes an MSP v2 request with a little-endian command and crc8_dvb_s2', () => {
		const frame = encodeMspV2(0x1001, [0xaa]);
		expect([...frame.subarray(0, 8)]).toEqual([0x24, 0x58, 0x3c, 0x00, 0x01, 0x10, 0x01, 0x00]);
		expect(frame[frame.length - 1]).toBe(crc8DvbS2(frame.subarray(3, frame.length - 1)));
	});

	it('matches the known crc8_dvb_s2 vector for the ASCII digits', () => {
		// The canonical dvb-s2 check value for "123456789".
		const bytes = [...'123456789'].map((c) => c.charCodeAt(0));
		expect(crc8DvbS2(bytes)).toBe(0xbc);
	});
});

describe('MspParser', () => {
	const response = (cmd: number, payload: number[]) => {
		const size = payload.length;
		const frame = [0x24, 0x4d, 0x3e, size, cmd, ...payload];
		let checksum = size ^ cmd;
		for (const b of payload) checksum ^= b;
		frame.push(checksum);
		return Uint8Array.from(frame);
	};

	it('parses a v1 response frame', () => {
		const parser = new MspParser();
		const frames = parser.feed(response(MSP.FC_VARIANT, [66, 84, 70, 76]));
		expect(frames).toHaveLength(1);
		expect(frames[0]).toMatchObject({ version: 1, cmd: MSP.FC_VARIANT, error: false });
		expect(decodeFcVariant(frames[0].payload)).toBe('BTFL');
	});

	it('reassembles a frame split across chunks', () => {
		const parser = new MspParser();
		const full = response(MSP.FC_VERSION, [4, 5, 0]);
		expect(parser.feed(full.subarray(0, 3))).toHaveLength(0);
		const frames = parser.feed(full.subarray(3));
		expect(frames).toHaveLength(1);
		expect(decodeFcVersion(frames[0].payload)).toBe('4.5.0');
	});

	it('resynchronizes past leading noise and a bad checksum', () => {
		const parser = new MspParser();
		const bad = [...response(MSP.API_VERSION, [1, 2, 3])];
		bad[bad.length - 1] ^= 0xff;
		const good = response(MSP.API_VERSION, [1, 45, 32]);
		const frames = parser.feed(Uint8Array.from([0x00, 0x99, ...bad, ...good]));
		expect(frames).toHaveLength(1);
		expect(decodeApiVersion(frames[0].payload)).toEqual({ protocol: 1, major: 45, minor: 32 });
	});

	it('parses a v2 response and validates its crc', () => {
		const parser = new MspParser();
		const payload = [1, 2, 3, 4];
		const req = encodeMspV2(MSP.STATUS, payload);
		req[2] = 0x3e; // flip request direction to response
		req[req.length - 1] = crc8DvbS2(req.subarray(3, req.length - 1));
		const frames = parser.feed(req);
		expect(frames).toHaveLength(1);
		expect(frames[0]).toMatchObject({ version: 2, cmd: MSP.STATUS });
	});

	it('surfaces an error-direction frame', () => {
		const parser = new MspParser();
		const frame = [0x24, 0x4d, 0x21, 0, MSP.REBOOT, 0 ^ MSP.REBOOT];
		const frames = parser.feed(Uint8Array.from(frame));
		expect(frames[0].error).toBe(true);
	});
});

describe('MSP decoders', () => {
	it('decodes attitude in degrees', () => {
		const payload = new Uint8Array(6);
		const v = new DataView(payload.buffer);
		v.setInt16(0, 105, true); // 10.5 deg roll
		v.setInt16(2, -32, true); // -3.2 deg pitch
		v.setInt16(4, 270, true); // 270 deg yaw
		expect(decodeAttitude(payload)).toEqual({ rollDeg: 10.5, pitchDeg: -3.2, yawDeg: 270 });
	});

	it('decodes GPS position, satellites, and hdop', () => {
		const payload = new Uint8Array(18);
		const v = new DataView(payload.buffer);
		v.setUint8(0, 2);
		v.setUint8(1, 11);
		v.setInt32(2, Math.round(33.749 * 1e7), true);
		v.setInt32(6, Math.round(-84.388 * 1e7), true);
		v.setUint16(10, 120, true);
		v.setUint16(12, 350, true); // 3.5 m/s
		v.setUint16(14, 900, true); // 90 deg
		v.setUint16(16, 145, true); // 1.45 hdop
		const gps = decodeRawGps(payload)!;
		expect(gps.numSat).toBe(11);
		expect(gps.lat).toBeCloseTo(33.749, 4);
		expect(gps.lon).toBeCloseTo(-84.388, 4);
		expect(gps.altM).toBe(120);
		expect(gps.speedMs).toBeCloseTo(3.5, 5);
		expect(gps.hdop).toBeCloseTo(1.45, 5);
	});

	it('decodes analog battery telemetry', () => {
		const payload = new Uint8Array(7);
		const v = new DataView(payload.buffer);
		v.setUint8(0, 168); // 16.8 V
		v.setUint16(1, 450, true);
		v.setUint16(3, 900, true);
		v.setInt16(5, 1234, true); // 12.34 A
		const a = decodeAnalog(payload)!;
		expect(a.voltageV).toBeCloseTo(16.8, 5);
		expect(a.mahDrawn).toBe(450);
		expect(a.amps).toBeCloseTo(12.34, 5);
	});

	it('prefers the extended U16 voltage over the clamped legacy byte', () => {
		const payload = new Uint8Array(9);
		const v = new DataView(payload.buffer);
		v.setUint8(0, 255); // legacy byte saturates at 25.5 V
		v.setUint16(1, 450, true);
		v.setUint16(3, 900, true);
		v.setInt16(5, 1234, true);
		v.setUint16(7, 4210, true); // 42.10 V (12S pack)
		expect(decodeAnalog(payload)!.voltageV).toBeCloseTo(42.1, 5);
	});

	it('decodes altitude and vario', () => {
		const payload = new Uint8Array(6);
		const v = new DataView(payload.buffer);
		v.setInt32(0, 1250, true); // 12.5 m
		v.setInt16(4, -40, true); // -0.4 m/s
		expect(decodeAltitude(payload)).toEqual({ altM: 12.5, varioMs: -0.4 });
	});

	it('reads the armed flag from the status mode-box bits', () => {
		const disarmed = new Uint8Array(10);
		expect(decodeStatus(disarmed)!.armed).toBe(false);
		const armed = new Uint8Array(10);
		new DataView(armed.buffer).setUint32(6, 1, true); // ARM box bit
		expect(decodeStatus(armed)!.armed).toBe(true);
	});

	it('returns null for short payloads', () => {
		expect(decodeRawGps(new Uint8Array(4))).toBeNull();
		expect(decodeAttitude(new Uint8Array(2))).toBeNull();
	});
});

describe('decodeBoardInfo', () => {
	it('reads the identifier, target name, and board name', () => {
		const info = decodeBoardInfo(buildBoardInfo('SBF4', 'SPEEDYBEEF405', 'SpeedyBee F405'));
		expect(info).toEqual({
			boardIdentifier: 'SBF4',
			targetName: 'SPEEDYBEEF405',
			boardName: 'SpeedyBee F405'
		});
	});

	it('yields the identifier with empty names when the payload carries no strings', () => {
		const info = decodeBoardInfo(new Uint8Array([0x53, 0x42, 0x46, 0x34, 0, 0]));
		expect(info).toEqual({ boardIdentifier: 'SBF4', targetName: '', boardName: '' });
	});

	it('returns null for a payload shorter than the identifier and version', () => {
		expect(decodeBoardInfo(new Uint8Array(4))).toBeNull();
	});
});
