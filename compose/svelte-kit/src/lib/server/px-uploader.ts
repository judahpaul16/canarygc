import { SerialPort } from 'serialport';
import { expectedFlashCrc, type FirmwareImage } from './apj';

// The PX4/ArduPilot serial bootloader protocol: the board answers on its USB
// serial for a few seconds after a reboot-to-bootloader, and every command is
// bytes ending in EOC with an INSYNC + status reply. This is the same protocol
// Mission Planner and QGroundControl flash Pixhawk-family boards with.
const INSYNC = 0x12;
const EOC = 0x20;
const OK = 0x10;
const FAILED = 0x11;
const INVALID = 0x13;
const BAD_SILICON_REV = 0x14;

const GET_SYNC = 0x21;
const GET_DEVICE = 0x22;
const CHIP_ERASE = 0x23;
const PROG_MULTI = 0x27;
const GET_CRC = 0x29;
const REBOOT = 0x30;

const INFO_BL_REV = 0x01;
const INFO_BOARD_ID = 0x02;
const INFO_FLASH_SIZE = 0x04;

const BAUD = 115200;
const PROG_MULTI_MAX = 252;
const SYNC_ATTEMPTS = 12;
const SYNC_RETRY_MS = 500;
const REPLY_TIMEOUT_MS = 3000;
const ERASE_TIMEOUT_MS = 30_000;

class BootloaderLink {
	private buffer: number[] = [];
	private waiter: { count: number; resolve: (bytes: number[]) => void } | null = null;
	private timer: ReturnType<typeof setTimeout> | null = null;

	constructor(private port: SerialPort) {
		port.on('data', (chunk: Buffer) => {
			for (const byte of chunk) this.buffer.push(byte);
			this.drain();
		});
	}

	private drain(): void {
		if (this.waiter && this.buffer.length >= this.waiter.count) {
			const bytes = this.buffer.splice(0, this.waiter.count);
			const { resolve } = this.waiter;
			this.waiter = null;
			if (this.timer) clearTimeout(this.timer);
			resolve(bytes);
		}
	}

	write(bytes: number[] | Uint8Array): Promise<void> {
		return new Promise((resolve, reject) => {
			this.port.write(Buffer.from(bytes), (err) => (err ? reject(err) : resolve()));
		});
	}

	read(count: number, timeoutMs = REPLY_TIMEOUT_MS): Promise<number[]> {
		return new Promise((resolve, reject) => {
			this.waiter = { count, resolve };
			this.timer = setTimeout(() => {
				this.waiter = null;
				reject(new Error('Bootloader reply timed out'));
			}, timeoutMs);
			this.drain();
		});
	}

	flushInput(): void {
		this.buffer.length = 0;
	}

	async expectSync(timeoutMs = REPLY_TIMEOUT_MS): Promise<void> {
		const [insync, status] = await this.read(2, timeoutMs);
		if (insync !== INSYNC) throw new Error(`Bootloader out of sync (0x${insync.toString(16)})`);
		if (status === OK) return;
		if (status === INVALID) throw new Error('Bootloader rejected the command as invalid');
		if (status === FAILED) throw new Error('Bootloader reported the operation failed');
		if (status === BAD_SILICON_REV) throw new Error('Bootloader refused: unsupported silicon revision');
		throw new Error(`Bootloader returned status 0x${status.toString(16)}`);
	}
}

function open(path: string): Promise<SerialPort> {
	return new Promise((resolve, reject) => {
		const port = new SerialPort({ path, baudRate: BAUD, lock: false }, (err) =>
			err ? reject(err) : resolve(port)
		);
	});
}

function close(port: SerialPort): Promise<void> {
	return new Promise((resolve) => port.close(() => resolve()));
}

// Uploads a parsed .apj/.px4 image to a board sitting in its serial
// bootloader: sync, identify and match the board id, erase, program in
// 252-byte chunks, verify the whole-flash CRC, and reboot into the new
// firmware. The log callback receives one line per phase for the flash log.
export async function uploadFirmware(
	path: string,
	fw: FirmwareImage,
	log: (line: string) => void
): Promise<void> {
	const port = await open(path);
	const link = new BootloaderLink(port);
	try {
		log(`Opened ${path} at ${BAUD} baud, looking for the bootloader...`);
		let synced = false;
		for (let attempt = 1; attempt <= SYNC_ATTEMPTS; attempt++) {
			try {
				link.flushInput();
				await link.write([GET_SYNC, EOC]);
				await link.expectSync(SYNC_RETRY_MS);
				synced = true;
				break;
			} catch {
				await new Promise((r) => setTimeout(r, SYNC_RETRY_MS));
			}
		}
		if (!synced) throw new Error('No bootloader answered; put the board in bootloader mode and retry');
		log('Bootloader in sync.');

		const info = async (code: number): Promise<number> => {
			await link.write([GET_DEVICE, code, EOC]);
			const bytes = await link.read(4);
			await link.expectSync();
			return (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
		};

		const blRev = await info(INFO_BL_REV);
		if (blRev < 2 || blRev > 5) throw new Error(`Unsupported bootloader revision ${blRev}`);
		const boardId = await info(INFO_BOARD_ID);
		const flashSize = await info(INFO_FLASH_SIZE);
		log(`Bootloader rev ${blRev}, board id ${boardId}, flash ${Math.round(flashSize / 1024)} KiB.`);

		if (boardId !== fw.boardId) {
			throw new Error(
				`Firmware is built for board id ${fw.boardId} but the connected board reports ${boardId}`
			);
		}
		if (fw.image.length > flashSize) {
			throw new Error(`Image (${fw.image.length} bytes) exceeds the board's flash (${flashSize} bytes)`);
		}

		log('Erasing flash (this takes up to 20 seconds)...');
		await link.write([CHIP_ERASE, EOC]);
		await link.expectSync(ERASE_TIMEOUT_MS);
		log('Erased.');

		log(`Programming ${fw.image.length} bytes...`);
		let sent = 0;
		let lastTenth = 0;
		while (sent < fw.image.length) {
			const chunk = fw.image.subarray(sent, sent + PROG_MULTI_MAX);
			await link.write([PROG_MULTI, chunk.length, ...chunk, EOC]);
			await link.expectSync();
			sent += chunk.length;
			const tenth = Math.floor((sent / fw.image.length) * 10);
			if (tenth > lastTenth) {
				lastTenth = tenth;
				log(`Programmed ${tenth * 10}%`);
			}
		}

		await link.write([GET_CRC, EOC]);
		const crcBytes = await link.read(4, ERASE_TIMEOUT_MS);
		await link.expectSync();
		const reported = (crcBytes[0] | (crcBytes[1] << 8) | (crcBytes[2] << 16) | (crcBytes[3] << 24)) >>> 0;
		const expected = expectedFlashCrc(fw.image, flashSize);
		if (reported !== expected) {
			throw new Error(
				`Verification failed: board CRC 0x${reported.toString(16)}, expected 0x${expected.toString(16)}`
			);
		}
		log(`Verified (CRC 0x${reported.toString(16)}).`);

		await link.write([REBOOT, EOC]);
		log('Rebooting into the new firmware.');
	} finally {
		await close(port);
	}
}
