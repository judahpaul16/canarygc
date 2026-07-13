import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseFirmwareJson } from './apj';
import { uploadFirmware } from './px-uploader';
import { linkAlive, sendMavlinkCommand, suspendLink, resumeLink } from './mavlink';

// Firmware catalogs and the flash paths for all four ecosystems: Betaflight
// and INAV flash an Intel HEX over STM32 USB DFU, while ArduPilot and PX4
// upload .apj/.px4 images over their serial bootloader protocol. Catalog
// lookups are cached so browsing the tab does not hammer the upstream APIs.
const CACHE_TTL_MS = 10 * 60 * 1000;
const MANIFEST_TTL_MS = 60 * 60 * 1000;
const BETAFLIGHT_API = 'https://build.betaflight.com/api';
const INAV_RELEASES_API = 'https://api.github.com/repos/iNavFlight/inav/releases?per_page=6';
const PX4_RELEASES_API = 'https://api.github.com/repos/PX4/PX4-Autopilot/releases?per_page=4';
const ARDUPILOT_MANIFEST = 'https://firmware.ardupilot.org/manifest.json.gz';
// STM32 devices expose the ROM bootloader as this USB DFU VID:PID, and the
// application flashes from the chip's flash base.
const STM32_DFU_ID = '0483:df11';
const STM32_FLASH_BASE = '0x08000000';
// The autopilot's serial device doubles as its bootloader port for a few
// seconds after a reboot-to-bootloader; matches the MAVLink production serial.
const BOOTLOADER_PATH = process.env.FC_BOOTLOADER_PATH ?? '/dev/ttyACM0';
const BUILD_POLL_MS = 3000;
const BUILD_POLL_LIMIT = 60;
const MAV_CMD_PREFLIGHT_REBOOT = 'PREFLIGHT_REBOOT_SHUTDOWN';
const REBOOT_TO_BOOTLOADER = 3;
const BOOTLOADER_SETTLE_MS = 3000;

interface CacheEntry<T> {
	at: number;
	value: T;
}
const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
	const hit = cache.get(key) as CacheEntry<T> | undefined;
	const now = Date.now();
	if (hit && now - hit.at < ttlMs) return hit.value;
	const value = await load();
	cache.set(key, { at: now, value });
	return value;
}

export interface BetaflightTarget {
	target: string;
	manufacturer: string;
	mcu: string;
}

export interface FirmwareRelease {
	release: string;
	type: string;
	date: string;
	url: string;
}

export async function listBetaflight(): Promise<{ targets: BetaflightTarget[]; releases: FirmwareRelease[] }> {
	return cached('betaflight', CACHE_TTL_MS, async () => {
		const [targetsRes, releasesRes] = await Promise.all([
			fetch(`${BETAFLIGHT_API}/targets`),
			fetch(`${BETAFLIGHT_API}/releases`)
		]);
		if (!targetsRes.ok || !releasesRes.ok) throw new Error('Betaflight catalog unavailable');
		const targetsRaw = (await targetsRes.json()) as Array<{ target: string; manufacturer: string; mcu: string }>;
		const releasesRaw = (await releasesRes.json()) as Array<{
			release: string;
			type: string;
			date: string;
			releaseUrl?: string;
		}>;
		return {
			targets: targetsRaw
				.map((t) => ({ target: t.target, manufacturer: t.manufacturer, mcu: t.mcu }))
				.sort((a, b) => a.target.localeCompare(b.target)),
			releases: releasesRaw.map((r) => ({
				release: r.release,
				type: r.type,
				date: r.date,
				url: r.releaseUrl ?? `https://github.com/betaflight/betaflight/releases/tag/${r.release}`
			}))
		};
	});
}

export interface InavRelease {
	release: string;
	tag: string;
	date: string;
	url: string;
	targets: string[];
}

export async function listInav(): Promise<InavRelease[]> {
	return cached('inav', CACHE_TTL_MS, async () => {
		const res = await fetch(INAV_RELEASES_API, {
			headers: { accept: 'application/vnd.github+json' }
		});
		if (!res.ok) throw new Error('INAV releases unavailable');
		const raw = (await res.json()) as Array<{
			tag_name: string;
			name: string;
			published_at: string;
			html_url: string;
			prerelease: boolean;
			assets: Array<{ name: string; browser_download_url: string }>;
		}>;
		return raw.map((r) => {
			const prefix = `inav_${r.tag_name}_`;
			const targets = r.assets
				.filter((a) => a.name.startsWith(prefix) && a.name.endsWith('.hex'))
				.map((a) => a.name.slice(prefix.length, -'.hex'.length))
				.sort();
			return {
				release: r.name || r.tag_name,
				tag: r.tag_name,
				date: r.published_at.slice(0, 10),
				url: r.html_url,
				targets
			};
		});
	});
}

// Resolves the direct hex asset URL for an INAV target so it can be fetched
// and flashed without leaving the tab.
export async function inavHexUrl(tag: string, target: string): Promise<string> {
	const releases = await listInav();
	const release = releases.find((r) => r.tag === tag);
	if (!release) throw new Error(`Unknown INAV release ${tag}`);
	if (!release.targets.includes(target)) throw new Error(`Target ${target} not in INAV ${tag}`);
	return `https://github.com/iNavFlight/inav/releases/download/${tag}/inav_${tag}_${target}.hex`;
}

export async function downloadHex(url: string): Promise<string> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Download failed: ${res.status}`);
	const text = await res.text();
	if (!text.trimStart().startsWith(':')) throw new Error('Downloaded file is not Intel HEX');
	return text;
}

export interface ArduPilotBoard {
	platform: string;
	version: string;
	url: string;
	boardId: number;
	brand: string;
}

export type ArduPilotCatalog = Record<string, ArduPilotBoard[]>;

const ARDUPILOT_VEHICLES = ['Copter', 'Plane', 'Rover', 'Sub'] as const;

// The manifest lists every build ever published; the catalog keeps the latest
// stable .apj per board (the /stable/ path) for each flyable vehicle type.
export async function listArduPilot(): Promise<ArduPilotCatalog> {
	return cached('ardupilot', MANIFEST_TTL_MS, async () => {
		const res = await fetch(ARDUPILOT_MANIFEST);
		if (!res.ok) throw new Error('ArduPilot manifest unavailable');
		const manifest = JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString()) as {
			firmware: Array<{
				format: string;
				url: string;
				platform: string;
				vehicletype: string;
				board_id?: number;
				brand_name?: string;
				'mav-firmware-version-type': string;
				'mav-firmware-version-str': string;
			}>;
		};
		// The manifest lists the same stable board under several rows, so keep
		// one per platform per vehicle (the newest version seen).
		const seen: Record<string, Map<string, ArduPilotBoard>> = {};
		for (const vehicle of ARDUPILOT_VEHICLES) seen[vehicle] = new Map();
		for (const entry of manifest.firmware) {
			if (entry.format !== 'apj') continue;
			if (entry['mav-firmware-version-type'] !== 'OFFICIAL') continue;
			if (!entry.url.includes('/stable/')) continue;
			if (typeof entry.board_id !== 'number') continue;
			const boards = seen[entry.vehicletype];
			if (!boards) continue;
			const existing = boards.get(entry.platform);
			const version = entry['mav-firmware-version-str'];
			if (existing && existing.version >= version) continue;
			boards.set(entry.platform, {
				platform: entry.platform,
				version,
				url: entry.url,
				boardId: entry.board_id,
				brand: entry.brand_name ?? ''
			});
		}
		const catalog: ArduPilotCatalog = {};
		for (const vehicle of ARDUPILOT_VEHICLES) {
			catalog[vehicle] = [...seen[vehicle].values()].sort((a, b) => a.platform.localeCompare(b.platform));
		}
		return catalog;
	});
}

export interface Px4Release {
	release: string;
	tag: string;
	date: string;
	url: string;
	boards: Array<{ board: string; url: string }>;
}

export async function listPx4(): Promise<Px4Release[]> {
	return cached('px4', CACHE_TTL_MS, async () => {
		const res = await fetch(PX4_RELEASES_API, { headers: { accept: 'application/vnd.github+json' } });
		if (!res.ok) throw new Error('PX4 releases unavailable');
		const raw = (await res.json()) as Array<{
			tag_name: string;
			name: string;
			published_at: string;
			html_url: string;
			assets: Array<{ name: string; browser_download_url: string }>;
		}>;
		return raw
			.map((r) => ({
				release: r.name || r.tag_name,
				tag: r.tag_name,
				date: r.published_at.slice(0, 10),
				url: r.html_url,
				boards: r.assets
					.filter((a) => a.name.endsWith('.px4'))
					.map((a) => ({ board: a.name.slice(0, -'.px4'.length), url: a.browser_download_url }))
					.sort((a, b) => a.board.localeCompare(b.board))
			}))
			.filter((r) => r.boards.length > 0);
	});
}

// Requests a stock cloud build for a release and target and waits for the
// hex. Identical builds are cached upstream, so a previously built pair
// returns in seconds while a fresh build takes about a minute.
export async function betaflightBuildHex(
	release: string,
	target: string,
	log: (line: string) => void
): Promise<string> {
	const submit = await fetch(`${BETAFLIGHT_API}/builds`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ release, target, options: [] })
	});
	if (!submit.ok) throw new Error(`Betaflight build request failed: ${submit.status}`);
	const { key } = (await submit.json()) as { key: string };
	log(`Cloud build ${key} submitted for ${target} ${release}.`);

	for (let attempt = 0; attempt < BUILD_POLL_LIMIT; attempt++) {
		const hexRes = await fetch(`${BETAFLIGHT_API}/builds/${key}/hex`);
		if (hexRes.status === 200) {
			log('Build complete, hex downloaded.');
			return hexRes.text();
		}
		const statusRes = await fetch(`${BETAFLIGHT_API}/builds/${key}/status`);
		if (statusRes.ok) {
			const { status } = (await statusRes.json()) as { status: string };
			log(`Build status: ${status}`);
			if (status === 'failure' || status === 'error') {
				throw new Error(`Betaflight cloud build ${status}`);
			}
		}
		await new Promise((r) => setTimeout(r, BUILD_POLL_MS));
	}
	throw new Error('Betaflight cloud build timed out');
}

function run(cmd: string, args: string[]): Promise<{ code: number; output: string }> {
	return new Promise((resolve, reject) => {
		let output = '';
		let child;
		try {
			child = spawn(cmd, args);
		} catch (err) {
			reject(err);
			return;
		}
		child.stdout.on('data', (d) => (output += d.toString()));
		child.stderr.on('data', (d) => (output += d.toString()));
		child.on('error', (err) =>
			reject(new Error(`${cmd} not available: ${(err as Error).message}`))
		);
		child.on('close', (code) => resolve({ code: code ?? -1, output }));
	});
}

export interface FlashResult {
	success: boolean;
	output: string;
}

// Flashes an Intel HEX to a flight controller sitting in STM32 DFU mode:
// objcopy lifts the hex to a raw image, then dfu-util writes it to the flash
// base and leaves DFU so the board boots the new firmware. Both tools ship in
// the production image; the operator puts the board in bootloader mode first,
// by the app's reboot-to-bootloader action or the board's boot pad.
export async function flashHex(hex: string): Promise<FlashResult> {
	const dir = await mkdtemp(join(tmpdir(), 'canarygc-fw-'));
	const hexPath = join(dir, 'firmware.hex');
	const binPath = join(dir, 'firmware.bin');
	try {
		await writeFile(hexPath, hex);
		const objcopy = await run('objcopy', ['-I', 'ihex', '-O', 'binary', hexPath, binPath]);
		if (objcopy.code !== 0) {
			return { success: false, output: `objcopy failed:\n${objcopy.output}` };
		}
		const dfu = await run('dfu-util', [
			'-a',
			'0',
			'-d',
			STM32_DFU_ID,
			'-s',
			`${STM32_FLASH_BASE}:leave`,
			'-D',
			binPath
		]);
		return { success: dfu.code === 0, output: dfu.output };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

// Flashes an ArduPilot .apj or PX4 .px4 over the serial bootloader: downloads
// and parses the image, asks a live MAVLink autopilot to reboot into its
// bootloader, releases the serial link, uploads, and hands the link back so
// the station reconnects to the new firmware.
export async function flashAutopilot(url: string): Promise<FlashResult> {
	const lines: string[] = [];
	const log = (line: string) => lines.push(line);
	try {
		log(`Downloading ${url}`);
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Download failed: ${res.status}`);
		const fw = parseFirmwareJson(await res.text());
		log(`Image ${fw.image.length} bytes for board id ${fw.boardId}${fw.description ? ` (${fw.description})` : ''}.`);

		if (linkAlive()) {
			log('Rebooting the autopilot into its bootloader...');
			await sendMavlinkCommand(MAV_CMD_PREFLIGHT_REBOOT, [REBOOT_TO_BOOTLOADER, 0, 0, 0, 0, 0, 0], true).catch(
				() => {}
			);
		}
		suspendLink();
		try {
			await new Promise((r) => setTimeout(r, BOOTLOADER_SETTLE_MS));
			await uploadFirmware(BOOTLOADER_PATH, fw, log);
		} finally {
			resumeLink();
		}
		return { success: true, output: lines.join('\n') };
	} catch (err) {
		log(`Error: ${(err as Error).message}`);
		return { success: false, output: lines.join('\n') };
	}
}
