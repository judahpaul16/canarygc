// Wire format of the binary telemetry stream. Each envelope is a type byte, a
// little-endian uint16 payload length, and the payload. Frame and line
// payloads start with the server's parse time as a little-endian float64 of
// epoch milliseconds, so the client reproduces the server's timestamps.
export const ENVELOPE_FRAME = 0;
export const ENVELOPE_LINE = 1;
export const ENVELOPE_KEEPALIVE = 2;
export const ENVELOPE_DISABLED = 3;

const HEADER_BYTES = 3;
const TS_BYTES = 8;

export type TelemetryEvent =
	| { kind: 'frame'; tsMs: number; frame: Uint8Array }
	| { kind: 'line'; tsMs: number; line: string }
	| { kind: 'disabled' };

function envelope(type: number, payloadBytes: number): { bytes: Uint8Array; view: DataView } {
	const bytes = new Uint8Array(HEADER_BYTES + payloadBytes);
	const view = new DataView(bytes.buffer);
	view.setUint8(0, type);
	view.setUint16(1, payloadBytes, true);
	return { bytes, view };
}

export function encodeFrameEnvelope(tsMs: number, frame: Uint8Array): Uint8Array {
	const { bytes, view } = envelope(ENVELOPE_FRAME, TS_BYTES + frame.length);
	view.setFloat64(HEADER_BYTES, tsMs, true);
	bytes.set(frame, HEADER_BYTES + TS_BYTES);
	return bytes;
}

export function encodeLineEnvelope(tsMs: number, line: string): Uint8Array {
	const text = new TextEncoder().encode(line);
	const { bytes, view } = envelope(ENVELOPE_LINE, TS_BYTES + text.length);
	view.setFloat64(HEADER_BYTES, tsMs, true);
	bytes.set(text, HEADER_BYTES + TS_BYTES);
	return bytes;
}

export function encodeMarkerEnvelope(type: typeof ENVELOPE_KEEPALIVE | typeof ENVELOPE_DISABLED): Uint8Array {
	return envelope(type, 0).bytes;
}

export class EnvelopeDecoder {
	private buffer = new Uint8Array(0);

	push(chunk: Uint8Array): TelemetryEvent[] {
		const merged = new Uint8Array(this.buffer.length + chunk.length);
		merged.set(this.buffer, 0);
		merged.set(chunk, this.buffer.length);
		this.buffer = merged;

		const events: TelemetryEvent[] = [];
		while (this.buffer.length >= HEADER_BYTES) {
			const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
			const type = view.getUint8(0);
			const payloadBytes = view.getUint16(1, true);
			if (this.buffer.length < HEADER_BYTES + payloadBytes) break;

			const payload = this.buffer.subarray(HEADER_BYTES, HEADER_BYTES + payloadBytes);
			this.buffer = this.buffer.subarray(HEADER_BYTES + payloadBytes);

			if (type === ENVELOPE_FRAME && payloadBytes > TS_BYTES) {
				const pv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
				events.push({ kind: 'frame', tsMs: pv.getFloat64(0, true), frame: payload.slice(TS_BYTES) });
			} else if (type === ENVELOPE_LINE && payloadBytes >= TS_BYTES) {
				const pv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
				events.push({
					kind: 'line',
					tsMs: pv.getFloat64(0, true),
					line: new TextDecoder().decode(payload.slice(TS_BYTES))
				});
			} else if (type === ENVELOPE_DISABLED) {
				events.push({ kind: 'disabled' });
			}
		}
		return events;
	}
}
