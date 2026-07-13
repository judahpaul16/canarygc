import { json, type RequestHandler } from '@sveltejs/kit';
import {
	listBetaflight,
	listInav,
	listArduPilot,
	listPx4,
	inavHexUrl,
	downloadHex,
	flashHex,
	flashAutopilot,
	betaflightBuildHex
} from '$lib/server/firmware';

export const GET: RequestHandler = async (event): Promise<Response> => {
	const loaders: Record<string, () => Promise<unknown>> = {
		betaflight: listBetaflight,
		inav: listInav,
		ardupilot: listArduPilot,
		px4: listPx4
	};
	const loader = loaders[event.params.type ?? ''];
	if (!loader) return new Response('Unknown firmware request', { status: 404 });
	try {
		return json(await loader());
	} catch (err) {
		return json({ error: (err as Error).message }, { status: 502 });
	}
};

interface FlashBody {
	source?: string;
	tag?: string;
	target?: string;
	release?: string;
	url?: string;
	hex?: string;
}

// ArduPilot and PX4 firmware download only from their official hosts.
const AUTOPILOT_URL_PREFIXES = [
	'https://firmware.ardupilot.org/',
	'https://github.com/PX4/PX4-Autopilot/releases/download/'
];

export const POST: RequestHandler = async (event): Promise<Response> => {
	if (event.params.type !== 'flash') return new Response('Unknown firmware request', { status: 404 });
	let body: FlashBody;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
	try {
		if (body.source === 'ardupilot' || body.source === 'px4') {
			if (!body.url || !AUTOPILOT_URL_PREFIXES.some((p) => body.url!.startsWith(p))) {
				return json({ error: 'Firmware URL is not an official ArduPilot or PX4 host' }, { status: 400 });
			}
			const result = await flashAutopilot(body.url);
			return json(result, { status: result.success ? 200 : 500 });
		}

		let hex: string;
		const buildLog: string[] = [];
		if (body.source === 'betaflight' && body.release && body.target) {
			hex = await betaflightBuildHex(body.release, body.target, (line) => buildLog.push(line));
		} else if (body.source === 'inav' && body.tag && body.target) {
			hex = await downloadHex(await inavHexUrl(body.tag, body.target));
		} else if (body.source === 'hex' && body.hex) {
			hex = body.hex;
			if (!hex.trimStart().startsWith(':')) return json({ error: 'File is not Intel HEX' }, { status: 400 });
		} else {
			return json({ error: 'Provide a firmware source to flash' }, { status: 400 });
		}
		const result = await flashHex(hex);
		if (buildLog.length > 0) result.output = `${buildLog.join('\n')}\n${result.output}`;
		return json(result, { status: result.success ? 200 : 500 });
	} catch (err) {
		return json({ error: (err as Error).message }, { status: 500 });
	}
};
