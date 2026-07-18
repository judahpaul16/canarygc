import type { RequestHandler } from '@sveltejs/kit';
import { getEnabledAlerts, setSetting } from '$lib/server/settings';
import { ALERT_IDS } from '$lib/alert-types';
import { m } from '$lib/paraglide/messages';

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

export const GET: RequestHandler = async (event) => {
    if (!event.locals.user) return json({ message: m.api_unauthorized() }, 401);
    return json({ enabled: [...(await getEnabledAlerts())] });
};

export const POST: RequestHandler = async (event) => {
    if (!event.locals.user) return json({ message: m.api_unauthorized() }, 401);
    const body = await event.request.json();

    const enabled: string[] = Array.isArray(body.enabled) ? body.enabled : [];
    for (const id of ALERT_IDS) {
        await setSetting(`alert.enabled.${id}`, enabled.includes(id) ? 'true' : 'false');
    }

    return json({ message: m.api_saved() });
};
