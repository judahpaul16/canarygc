import { describe, expect, it } from 'vitest';
import { MavLinkProtocolV1, MavLinkProtocolV2, common, minimal } from 'node-mavlink';
import type { MavLinkData, MavLinkDataConstructor } from 'mavlink-mappings';
import { decodeFrameToLine } from './mavlink-decode';
import { convertBigIntToNumber, formatTelemetryLine } from './telemetry-line';
import {
	ENVELOPE_DISABLED,
	ENVELOPE_KEEPALIVE,
	EnvelopeDecoder,
	encodeFrameEnvelope,
	encodeLineEnvelope,
	encodeMarkerEnvelope
} from './telemetry-envelope';

const TS = 1750000000000;

// The server parses the truncated payload slice out of the wire frame and
// formats the line; a client decode of the same frame must produce the same
// string byte for byte.
function serverLine(frame: Buffer): string {
	const v1 = frame[0] === 0xfe;
	const payload = frame.subarray(v1 ? 6 : 10, (v1 ? 6 : 10) + frame[1]);
	const msgId = v1 ? frame[5] : frame[7] | (frame[8] << 8) | (frame[9] << 16);
	const registry: Record<number, MavLinkDataConstructor<MavLinkData>> = {
		...minimal.REGISTRY,
		...common.REGISTRY
	};
	const clazz = registry[msgId];
	const protocol = v1 ? new MavLinkProtocolV1() : new MavLinkProtocolV2();
	const data = protocol.data(payload, clazz);
	return formatTelemetryLine(clazz, convertBigIntToNumber(data), new Date(TS).toISOString());
}

describe('decodeFrameToLine parity with the server pipeline', () => {
	it('matches on a truncated HEARTBEAT', () => {
		const msg = new minimal.Heartbeat();
		msg.type = minimal.MavType.QUADROTOR;
		msg.autopilot = minimal.MavAutopilot.ARDUPILOTMEGA;
		msg.baseMode = 81 as minimal.MavModeFlag;
		msg.customMode = 0;
		msg.systemStatus = minimal.MavState.ACTIVE;
		msg.mavlinkVersion = 3;
		const frame = new MavLinkProtocolV2().serialize(msg, 1);
		expect(decodeFrameToLine(TS, frame)).toBe(serverLine(frame));
	});

	it('matches on ATTITUDE floats', () => {
		const msg = new common.Attitude();
		msg.timeBootMs = 123456;
		msg.roll = 0.12345678;
		msg.pitch = -0.087;
		msg.yaw = 3.14159;
		msg.rollspeed = 0.001;
		msg.pitchspeed = -0.002;
		msg.yawspeed = 0;
		const frame = new MavLinkProtocolV2().serialize(msg, 2);
		expect(decodeFrameToLine(TS, frame)).toBe(serverLine(frame));
	});

	it('matches on GLOBAL_POSITION_INT scaled integers', () => {
		const msg = new common.GlobalPositionInt();
		msg.timeBootMs = 98765;
		msg.lat = 337500000;
		msg.lon = -843900000;
		msg.alt = 250000;
		msg.relativeAlt = 120000;
		msg.vx = -15;
		msg.vy = 22;
		msg.vz = -3;
		msg.hdg = 27000;
		const frame = new MavLinkProtocolV2().serialize(msg, 3);
		expect(decodeFrameToLine(TS, frame)).toBe(serverLine(frame));
	});

	it('matches on SYSTEM_TIME uint64', () => {
		const msg = new common.SystemTime();
		msg.timeUnixUsec = 1750000000000000n;
		msg.timeBootMs = 424242;
		const frame = new MavLinkProtocolV2().serialize(msg, 4);
		expect(decodeFrameToLine(TS, frame)).toBe(serverLine(frame));
	});

	it('matches on STATUSTEXT with quotes in the text', () => {
		const msg = new common.StatusText();
		msg.severity = common.MavSeverity.WARNING;
		msg.text = 'PreArm: "GPS" not healthy';
		const frame = new MavLinkProtocolV2().serialize(msg, 5);
		const line = decodeFrameToLine(TS, frame);
		expect(line).toBe(serverLine(frame));
		expect(line).toContain('PreArm');
	});

	it('matches on GPS_RAW_INT extension fields', () => {
		const msg = new common.GpsRawInt();
		msg.timeUsec = 111222333n;
		msg.fixType = common.GpsFixType.GPS_FIX_TYPE_3D_FIX;
		msg.lat = 337500000;
		msg.lon = -843900000;
		msg.alt = 250000;
		msg.eph = 121;
		msg.epv = 199;
		msg.vel = 512;
		msg.cog = 18000;
		msg.satellitesVisible = 14;
		msg.altEllipsoid = 251000;
		msg.hAcc = 800;
		msg.vAcc = 1200;
		msg.velAcc = 300;
		msg.hdgAcc = 500;
		msg.yaw = 9000;
		const frame = new MavLinkProtocolV2().serialize(msg, 6);
		expect(decodeFrameToLine(TS, frame)).toBe(serverLine(frame));
	});

	it('matches on a MAVLink 1 frame', () => {
		const msg = new minimal.Heartbeat();
		msg.type = minimal.MavType.FIXED_WING;
		msg.autopilot = minimal.MavAutopilot.PX4;
		msg.baseMode = 29 as minimal.MavModeFlag;
		msg.customMode = 65536;
		msg.systemStatus = minimal.MavState.STANDBY;
		msg.mavlinkVersion = 3;
		const frame = new MavLinkProtocolV1().serialize(msg, 7);
		expect(decodeFrameToLine(TS, frame)).toBe(serverLine(frame));
	});

	it('returns null for an unknown message id', () => {
		const msg = new minimal.Heartbeat();
		const frame = new MavLinkProtocolV2().serialize(msg, 8);
		frame[7] = 0xff;
		frame[8] = 0xff;
		frame[9] = 0x0f;
		expect(decodeFrameToLine(TS, frame)).toBeNull();
	});
});

describe('EnvelopeDecoder', () => {
	it('decodes frames, lines, and markers from one chunk', () => {
		const msg = new minimal.Heartbeat();
		msg.type = minimal.MavType.QUADROTOR;
		const frame = new MavLinkProtocolV2().serialize(msg, 1);
		const chunk = new Uint8Array([
			...encodeFrameEnvelope(TS, frame),
			...encodeLineEnvelope(TS, 'MAVLink connection initialized'),
			...encodeMarkerEnvelope(ENVELOPE_KEEPALIVE),
			...encodeMarkerEnvelope(ENVELOPE_DISABLED)
		]);
		const events = new EnvelopeDecoder().push(chunk);
		expect(events).toHaveLength(3);
		expect(events[0]).toMatchObject({ kind: 'frame', tsMs: TS });
		expect(Array.from((events[0] as { frame: Uint8Array }).frame)).toEqual(Array.from(frame));
		expect(events[1]).toEqual({ kind: 'line', tsMs: TS, line: 'MAVLink connection initialized' });
		expect(events[2]).toEqual({ kind: 'disabled' });
	});

	it('reassembles envelopes fed one byte at a time', () => {
		const msg = new common.Attitude();
		msg.roll = 1.5;
		const frame = new MavLinkProtocolV2().serialize(msg, 2);
		const stream = new Uint8Array([
			...encodeFrameEnvelope(TS, frame),
			...encodeLineEnvelope(TS + 1, 'line two')
		]);
		const decoder = new EnvelopeDecoder();
		const events = [];
		for (const byte of stream) events.push(...decoder.push(new Uint8Array([byte])));
		expect(events).toHaveLength(2);
		expect(events[0].kind).toBe('frame');
		expect(events[1]).toEqual({ kind: 'line', tsMs: TS + 1, line: 'line two' });
	});
});
