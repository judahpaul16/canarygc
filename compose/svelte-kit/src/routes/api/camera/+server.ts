import type { RequestHandler } from '@sveltejs/kit';
import { getSetting, setSetting } from '$lib/server/settings';
import { applyCameraSource, checkCameraReady, readCameraSource } from '$lib/server/mediamtx';
import { m } from '$lib/paraglide/messages';

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

export const GET: RequestHandler = async (event) => {
    if (!event.locals.user) return json({ message: m.api_unauthorized() }, 401);
    const source = await readCameraSource();
    return json({ kind: source.kind, piCamId: source.piCamId ?? 0, ready: await checkCameraReady() });
};

export const POST: RequestHandler = async (event) => {
    if (!event.locals.user) return json({ message: m.api_unauthorized() }, 401);
    const source = await readCameraSource();
    if (source.kind !== 'pi') return json({ message: m.api_camera_not_pi() }, 409);
    const body = await event.request.json();
    const piCamId = Number(body.piCamId) === 1 ? 1 : 0;
    await setSetting('camera.piCamId', String(piCamId));
    const lowBandwidth = (await getSetting('mode.lowBandwidth')) === 'true';
    const applied = await applyCameraSource({ kind: 'pi', piCamId }, lowBandwidth);
    let ready: boolean | null = null;
    if (applied) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        ready = await checkCameraReady();
    }
    return json({ applied, piCamId, ready });
};
