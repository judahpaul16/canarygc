import { DESERIALIZERS } from 'node-mavlink/dist/lib/serialization';
import { REGISTRY } from './mavlink-registry';
import { convertBigIntToNumber, formatTelemetryLine } from './telemetry-line';

const V2_MAGIC = 0xfd;
const V1_MAGIC = 0xfe;
const V2_PAYLOAD_OFFSET = 10;
const V1_PAYLOAD_OFFSET = 6;

function bufferReader(bytes: Uint8Array): Buffer {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return {
		readUInt8: (o: number) => view.getUint8(o),
		readInt8: (o: number) => view.getInt8(o),
		readUInt16LE: (o: number) => view.getUint16(o, true),
		readInt16LE: (o: number) => view.getInt16(o, true),
		readUInt32LE: (o: number) => view.getUint32(o, true),
		readInt32LE: (o: number) => view.getInt32(o, true),
		readBigUInt64LE: (o: number) => view.getBigUint64(o, true),
		readBigInt64LE: (o: number) => view.getBigInt64(o, true),
		readFloatLE: (o: number) => view.getFloat32(o, true),
		readDoubleLE: (o: number) => view.getFloat64(o, true)
	} as unknown as Buffer;
}

export function decodeFrame(frame: Uint8Array): { msgName: string; data: unknown } | null {
	if (frame.length < 2) return null;

	let msgId: number;
	let payloadStart: number;
	const payloadLength = frame[1];
	if (frame[0] === V2_MAGIC) {
		if (frame.length < V2_PAYLOAD_OFFSET) return null;
		msgId = frame[7] | (frame[8] << 8) | (frame[9] << 16);
		payloadStart = V2_PAYLOAD_OFFSET;
	} else if (frame[0] === V1_MAGIC) {
		if (frame.length < V1_PAYLOAD_OFFSET) return null;
		msgId = frame[5];
		payloadStart = V1_PAYLOAD_OFFSET;
	} else {
		return null;
	}

	const clazz = REGISTRY[msgId];
	if (!clazz) return null;

	// MAVLink 2 truncates trailing zero bytes, so the payload is re-padded to
	// the full field span before field extraction.
	let needed = 0;
	for (const field of clazz.FIELDS) {
		const fieldLength = field.length === 0 ? field.size : field.length * field.size;
		needed = Math.max(needed, field.offset + fieldLength);
	}
	const payload = new Uint8Array(needed);
	payload.set(frame.subarray(payloadStart, payloadStart + payloadLength));
	const reader = bufferReader(payload);

	const instance = new clazz() as unknown as Record<string, unknown>;
	for (const field of clazz.FIELDS) {
		const deserialize = DESERIALIZERS[field.type];
		if (!deserialize) return null;
		instance[field.name] = deserialize(reader, field.offset, field.length);
	}
	return { msgName: clazz.MSG_NAME, data: convertBigIntToNumber(instance) };
}

export function decodeFrameToLine(tsMs: number, frame: Uint8Array): string | null {
	if (frame.length < 8) return null;
	const msgId =
		frame[0] === V2_MAGIC ? frame[7] | (frame[8] << 8) | (frame[9] << 16) : frame[5];
	const clazz = REGISTRY[msgId];
	if (!clazz) return null;
	const decoded = decodeFrame(frame);
	if (!decoded) return null;
	return formatTelemetryLine(clazz, decoded.data, new Date(tsMs).toISOString());
}
