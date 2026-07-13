import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { parseFirmwareJson, crc32Bootloader, expectedFlashCrc } from './apj';

const makeApj = (image: Buffer, boardId = 1025) =>
	JSON.stringify({
		board_id: boardId,
		image_size: image.length,
		description: 'test firmware',
		image: deflateSync(image).toString('base64')
	});

describe('parseFirmwareJson', () => {
	it('inflates the image and reads the board id', () => {
		const image = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
		const fw = parseFirmwareJson(makeApj(image, 9));
		expect(fw.boardId).toBe(9);
		expect(fw.description).toBe('test firmware');
		expect([...fw.image]).toEqual([...image]);
	});

	it('pads the image to a four-byte boundary with 0xff', () => {
		const fw = parseFirmwareJson(makeApj(Buffer.from([1, 2, 3, 4, 5])));
		expect(fw.image.length).toBe(8);
		expect([...fw.image.subarray(5)]).toEqual([0xff, 0xff, 0xff]);
	});

	it('rejects files that are not firmware JSON', () => {
		expect(() => parseFirmwareJson(':020000040800F2')).toThrow('Not an ArduPilot or PX4 firmware file');
		expect(() => parseFirmwareJson('{"image": 5}')).toThrow('Not an ArduPilot or PX4 firmware file');
	});
});

describe('bootloader CRC32', () => {
	// Fixtures computed with an independent Python implementation of the
	// bootloader's CRC (0xEDB88320 table, zero seed, no final inversion).
	it('matches the independent fixtures', () => {
		const ascii = Uint8Array.from([...'123456789'].map((c) => c.charCodeAt(0)));
		expect(crc32Bootloader(ascii)).toBe(0x2dfd2d88);
		expect(crc32Bootloader(Uint8Array.from([0xde, 0xad, 0xbe, 0xef]))).toBe(0x5dd87c46);
	});

	it('pads with erased-flash bytes out to the flash size', () => {
		const image = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
		expect(expectedFlashCrc(image, 8)).toBe(0x6114d468);
		expect(expectedFlashCrc(image, 4)).toBe(crc32Bootloader(image));
	});
});
