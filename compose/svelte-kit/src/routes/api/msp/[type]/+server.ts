import { json, type RequestHandler } from '@sveltejs/kit';
import { mspConfigured, detectFc, readTelemetry, rebootToBootloader } from '$lib/server/msp';

export const GET: RequestHandler = async (event): Promise<Response> => {
	switch (event.params.type) {
		case 'status':
			return json({ configured: mspConfigured() });
		case 'detect':
			try {
				return json(await detectFc());
			} catch (err) {
				return json({ error: (err as Error).message }, { status: 503 });
			}
		case 'telemetry':
			try {
				return json(await readTelemetry());
			} catch (err) {
				return json({ error: (err as Error).message }, { status: 503 });
			}
		default:
			return new Response('Unknown MSP request', { status: 404 });
	}
};

export const POST: RequestHandler = async (event): Promise<Response> => {
	switch (event.params.type) {
		case 'reboot-bootloader':
			try {
				await rebootToBootloader();
				return json({ ok: true });
			} catch (err) {
				return json({ error: (err as Error).message }, { status: 503 });
			}
		default:
			return new Response('Unknown MSP request', { status: 404 });
	}
};
