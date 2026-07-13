import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Firmware catalogs and the STM32 DFU flash path for Betaflight and INAV
// flight controllers. Catalog lookups are cached briefly so browsing the tab
// does not hammer the upstream build and release APIs.
const CACHE_TTL_MS = 10 * 60 * 1000;
const BETAFLIGHT_API = 'https://build.betaflight.com/api';
const INAV_RELEASES_API = 'https://api.github.com/repos/iNavFlight/inav/releases?per_page=6';
// STM32 devices expose the ROM bootloader as this USB DFU VID:PID, and the
// application flashes from the chip's flash base.
const STM32_DFU_ID = '0483:df11';
const STM32_FLASH_BASE = '0x08000000';

interface CacheEntry<T> {
	at: number;
	value: T;
}
const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
	const hit = cache.get(key) as CacheEntry<T> | undefined;
	const now = Date.now();
	if (hit && now - hit.at < CACHE_TTL_MS) return hit.value;
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
	return cached('betaflight', async () => {
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
	return cached('inav', async () => {
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
