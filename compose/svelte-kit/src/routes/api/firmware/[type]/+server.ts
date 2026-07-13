import { json, type RequestHandler } from '@sveltejs/kit';
import { listBetaflight, listInav, inavHexUrl, downloadHex, flashHex } from '$lib/server/firmware';

export const GET: RequestHandler = async (event): Promise<Response> => {
	switch (event.params.type) {
		case 'betaflight':
			try {
				return json(await listBetaflight());
			} catch (err) {
				return json({ error: (err as Error).message }, { status: 502 });
			}
		case 'inav':
			try {
				return json(await listInav());
			} catch (err) {
				return json({ error: (err as Error).message }, { status: 502 });
			}
		default:
			return new Response('Unknown firmware request', { status: 404 });
	}
};

export const POST: RequestHandler = async (event): Promise<Response> => {
	if (event.params.type !== 'flash') return new Response('Unknown firmware request', { status: 404 });
	let body: { source?: string; tag?: string; target?: string; hex?: string };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
	try {
		let hex: string;
		if (body.source === 'inav' && body.tag && body.target) {
			hex = await downloadHex(await inavHexUrl(body.tag, body.target));
		} else if (body.source === 'hex' && body.hex) {
			hex = body.hex;
			if (!hex.trimStart().startsWith(':')) return json({ error: 'File is not Intel HEX' }, { status: 400 });
		} else {
			return json({ error: 'Provide an INAV target or an Intel HEX file' }, { status: 400 });
		}
		const result = await flashHex(hex);
		return json(result, { status: result.success ? 200 : 500 });
	} catch (err) {
		return json({ error: (err as Error).message }, { status: 500 });
	}
};
