import { json, type RequestHandler } from '@sveltejs/kit';
import {
	mspConfigured,
	detectFc,
	readTelemetry,
	rebootToBootloader,
	uploadMissionMsp,
	mspCalibrate,
	readModeConfig,
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
import {
	startInavMission,
	startInavTakeoff,
	stopInavMission,
	heartbeatInavMission,
	inavMissionStatus
} from '$lib/server/inav-mission';
import { planInavEngage } from '$lib/inav-mission';
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
		case 'inav_status':
			return json(inavMissionStatus());
		case 'inav_mode_config':
			try {
				const mode = await readModeConfig();
				return json({ ...mode, plan: planInavEngage(mode) });
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
		case 'calibrate':
			try {
				const body = (await event.request.json()) as { kind: string };
				const result = await mspCalibrate(body.kind);
				return json(result, { status: result.ok ? 200 : 400 });
			} catch (err) {
				return json({ error: (err as Error).message }, { status: 503 });
			}
		case 'guidance_stop':
			stopGuidance();
			return json({ ok: true });
		case 'guidance_heartbeat':
			heartbeatGuidance();
			return json({ ok: true });
		case 'inav_mission_start':
			try {
				const body = (await event.request.json().catch(() => ({}))) as { waypoints?: MspMissionItem[] };
				const result = await startInavMission(body.waypoints);
				return json(result, { status: result.ok ? 200 : 400 });
			} catch (err) {
				return json({ error: (err as Error).message }, { status: 503 });
			}
		case 'inav_takeoff':
			try {
				const body = (await event.request.json().catch(() => ({}))) as { altM?: number };
				const result = await startInavTakeoff(Number(body.altM) || 10);
				return json(result, { status: result.ok ? 200 : 400 });
			} catch (err) {
				return json({ error: (err as Error).message }, { status: 503 });
			}
		case 'inav_stop':
			stopInavMission();
			return json({ ok: true });
		case 'inav_heartbeat':
			heartbeatInavMission();
			return json({ ok: true });
		default:
			return new Response('Unknown MSP request', { status: 404 });
	}
};
