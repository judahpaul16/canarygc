import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import {
	MavLinkPacketParser,
	MavLinkPacketSplitter,
	minimal,
	sendSigned,
	type MavLinkPacket
} from 'node-mavlink';
import { deriveSigningKey, nextSigningTimestamp } from './mavlink-signing';

describe('deriveSigningKey', () => {
	it('derives a 32-byte SHA-256 key from the passphrase', () => {
		const key = deriveSigningKey('correct horse');
		expect(key).not.toBeNull();
		expect(key!.length).toBe(32);
		expect(key!.toString('hex')).toBe(createHash('sha256').update('correct horse').digest('hex'));
	});

	it('returns null for an empty or whitespace passphrase', () => {
		expect(deriveSigningKey('')).toBeNull();
		expect(deriveSigningKey('   ')).toBeNull();
	});
});

describe('nextSigningTimestamp', () => {
	it('uses the clock when it has advanced', () => {
		expect(nextSigningTimestamp(1000, 900)).toBe(1000);
	});

	it('forces a strict increase when the clock has not advanced', () => {
		expect(nextSigningTimestamp(1000, 1000)).toBe(1001);
		expect(nextSigningTimestamp(1000, 1005)).toBe(1006);
	});
});

describe('sign and verify round trip', () => {
	it('a signed message verifies with the key and fails with a wrong key', async () => {
		const key = deriveSigningKey('shared-secret')!;

		const chunks: Buffer[] = [];
		const sink = new Writable();
		sink._write = (chunk: Buffer, _enc: BufferEncoding, cb: (e?: Error | null) => void) => {
			chunks.push(chunk);
			cb();
		};

		const heartbeat = new minimal.Heartbeat();
		heartbeat.type = minimal.MavType.GCS;
		await sendSigned(sink, heartbeat, key);

		const packets: MavLinkPacket[] = [];
		await new Promise<void>((resolve) => {
			Readable.from([Buffer.concat(chunks)])
				.pipe(new MavLinkPacketSplitter())
				.pipe(new MavLinkPacketParser())
				.on('data', (packet: MavLinkPacket) => packets.push(packet))
				.on('end', resolve);
		});

		expect(packets).toHaveLength(1);
		expect(packets[0].signature).not.toBeNull();
		expect(packets[0].signature!.matches(key)).toBe(true);
		expect(packets[0].signature!.matches(deriveSigningKey('other')!)).toBe(false);
	});
});
