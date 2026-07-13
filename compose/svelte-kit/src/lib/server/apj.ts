import { inflateSync } from 'node:zlib';

// ArduPilot .apj and PX4 .px4 firmware files share one container: a JSON
// document whose image field is the zlib-compressed, base64-encoded firmware
// binary, alongside the numeric id of the board it was built for.
export interface FirmwareImage {
	boardId: number;
	image: Buffer;
	description: string;
}

export function parseFirmwareJson(text: string): FirmwareImage {
	let parsed: { board_id?: unknown; image?: unknown; description?: unknown; summary?: unknown };
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error('Not an ArduPilot or PX4 firmware file');
	}
	if (typeof parsed.board_id !== 'number' || typeof parsed.image !== 'string') {
		throw new Error('Not an ArduPilot or PX4 firmware file');
	}
	let image: Buffer;
	try {
		image = inflateSync(Buffer.from(parsed.image, 'base64'));
	} catch {
		throw new Error('Firmware image failed to decompress');
	}
	// The bootloader programs in words, so the image pads to a 4-byte boundary.
	const remainder = image.length % 4;
	if (remainder !== 0) {
		image = Buffer.concat([image, Buffer.alloc(4 - remainder, 0xff)]);
	}
	const description =
		typeof parsed.description === 'string'
			? parsed.description
			: typeof parsed.summary === 'string'
				? parsed.summary
				: '';
	return { boardId: parsed.board_id, image, description };
}

// The PX4/ArduPilot bootloader CRC32: the reflected 0xEDB88320 table, but
// seeded with zero and without the final inversion, unlike zlib's crc32.
const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
		}
		table[i] = c >>> 0;
	}
	return table;
})();

export function crc32Bootloader(data: Uint8Array, state = 0): number {
	for (const byte of data) {
		state = (CRC_TABLE[(state ^ byte) & 0xff] ^ (state >>> 8)) >>> 0;
	}
	return state >>> 0;
}

// The bootloader reports the CRC of its whole flash region, so the expected
// value covers the image plus 0xff erased flash out to the reported size.
export function expectedFlashCrc(image: Buffer, flashSize: number): number {
	let state = crc32Bootloader(image);
	for (let i = image.length; i < flashSize; i++) {
		state = (CRC_TABLE[(state ^ 0xff) & 0xff] ^ (state >>> 8)) >>> 0;
	}
	return state >>> 0;
}
