import { json, type RequestHandler } from '@sveltejs/kit';
import {
	mspConfigured,
	detectFc,
	readTelemetry,
	rebootToBootloader,
	uploadMissionMsp,
	type MspMissionItem
} from '$lib/server/msp';
import {
	startGuidance,
	stopGuidance,
	heartbeatGuidance,
	guidanceStatus,
	sendManualRc,
	type StartGuidanceOptions
} from '$lib/server/msp-guidance';
import type { GuidancePoint } from '$lib/msp-guidance';

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
		case 'guidance_status':
			return json(guidanceStatus());
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
		case 'load_mission':
			try {
				const items = (await event.request.json()) as MspMissionItem[];
				const result = await uploadMissionMsp(items);
				return json(result, { status: result.ok ? 200 : 400 });
			} catch (err) {
				return json({ error: (err as Error).message }, { status: 503 });
			}
		case 'guidance_start':
			try {
				const body = (await event.request.json()) as {
					waypoints: GuidancePoint[];
					options?: StartGuidanceOptions;
				};
				const result = await startGuidance(body.waypoints ?? [], body.options ?? {});
				return json(result, { status: result.ok ? 200 : 400 });
			} catch (err) {
				return json({ error: (err as Error).message }, { status: 503 });
			}
		case 'manual_control': {
			const h = event.request.headers;
			const num = (k: string, d = 0) => {
				const v = parseInt(h.get(k) ?? '');
				return Number.isFinite(v) ? v : d;
			};
			try {
				await sendManualRc({ x: num('x'), y: num('y'), z: num('z', 500), r: num('r') }, h.get('armed') === 'true');
				return json({ ok: true });
			} catch (err) {
				return json({ error: (err as Error).message }, { status: 503 });
			}
		}
		case 'guidance_stop':
			stopGuidance();
			return json({ ok: true });
		case 'guidance_heartbeat':
			heartbeatGuidance();
			return json({ ok: true });
		default:
			return new Response('Unknown MSP request', { status: 404 });
	}
};
