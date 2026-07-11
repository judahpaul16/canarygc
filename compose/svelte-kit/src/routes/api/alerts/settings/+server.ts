import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getAlertConfig, setSetting } from '$lib/server/settings';
import { ALERT_IDS } from '$lib/alert-types';

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

async function operatorEmail(userId: string): Promise<string> {
    const result = await db.execute({ sql: 'SELECT email FROM user WHERE id = ?', args: [userId] });
    const row = result.rows[0] as unknown as { email: string | null } | undefined;
    return row?.email ?? '';
}

export const GET: RequestHandler = async (event) => {
    if (!event.locals.user) return json({ message: 'Unauthorized' }, 401);
    const { recipient, enabled } = await getAlertConfig();
    return json({
        enabled: [...enabled],
        recipient: recipient || (await operatorEmail(event.locals.user.id))
    });
};

export const POST: RequestHandler = async (event) => {
    if (!event.locals.user) return json({ message: 'Unauthorized' }, 401);
    const body = await event.request.json();

    if (typeof body.recipient === 'string') await setSetting('alert.recipient', body.recipient.trim());

    const enabled: string[] = Array.isArray(body.enabled) ? body.enabled : [];
    for (const id of ALERT_IDS) {
        await setSetting(`alert.enabled.${id}`, enabled.includes(id) ? 'true' : 'false');
    }

    return json({ message: 'Saved' });
};
