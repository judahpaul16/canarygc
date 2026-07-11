import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getSetting, getSettings, setSetting } from '$lib/server/settings';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    const smtp = await getSettings('smtp.');
    const openaip = (await getSetting('integration.openaip')) ?? process.env.OPENAIP_API_KEY ?? '';
    const altitudeAngel =
        (await getSetting('integration.altitude_angel')) ?? process.env.VITE_ALTITUDE_ANGEL_API_KEY ?? '';

    return json({
        email: await operatorEmail(event.locals.user.id),
        smtp: {
            host: smtp['smtp.host'] ?? '',
            port: smtp['smtp.port'] ?? '587',
            secure: (smtp['smtp.secure'] ?? 'false') === 'true',
            user: smtp['smtp.user'] ?? '',
            from: smtp['smtp.from'] ?? '',
            passSet: Boolean(smtp['smtp.pass'])
        },
        openaipSet: Boolean(openaip),
        altitudeAngelSet: Boolean(altitudeAngel)
    });
};

export const POST: RequestHandler = async (event) => {
    if (!event.locals.user) return json({ message: 'Unauthorized' }, 401);

    const body = await event.request.json();

    if (typeof body.email === 'string' && EMAIL_RE.test(body.email)) {
        await db.execute({ sql: 'UPDATE user SET email = ? WHERE id = ?', args: [body.email, event.locals.user.id] });
    }

    const smtp = body.smtp ?? {};
    if (typeof smtp.host === 'string') await setSetting('smtp.host', smtp.host.trim());
    if (smtp.port !== undefined) await setSetting('smtp.port', String(smtp.port));
    if (smtp.secure !== undefined) await setSetting('smtp.secure', smtp.secure ? 'true' : 'false');
    if (typeof smtp.user === 'string') await setSetting('smtp.user', smtp.user.trim());
    if (typeof smtp.from === 'string') await setSetting('smtp.from', smtp.from.trim());
    // Secrets are only overwritten when a new value is supplied; a blank field keeps the stored one.
    if (typeof smtp.pass === 'string' && smtp.pass.length > 0) await setSetting('smtp.pass', smtp.pass);
    if (typeof body.openaip === 'string' && body.openaip.length > 0) await setSetting('integration.openaip', body.openaip.trim());
    if (typeof body.altitudeAngel === 'string' && body.altitudeAngel.length > 0)
        await setSetting('integration.altitude_angel', body.altitudeAngel.trim());

    return json({ message: 'Saved' });
};
