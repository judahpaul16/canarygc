import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getSetting, getSettings, setSetting } from '$lib/server/settings';
import { applyCameraSource } from '$lib/server/mediamtx';
import { refreshSigningConfig, provisionVehicleSigning } from '$lib/server/mavlink';
import type { CameraSourceKind } from '$lib/camera-source';
import { baseLocale, isLocale } from '$lib/paraglide/runtime';
import { m } from '$lib/paraglide/messages';

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
    if (!event.locals.user) return json({ message: m.api_unauthorized() }, 401);

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
        altitudeAngelSet: Boolean(altitudeAngel),
        maptiler: (await getSetting('integration.maptiler')) ?? '',
        uiLocale: (await getSetting('ui.locale')) ?? baseLocale,
        tiles: {
            light: (await getSetting('tiles.light')) ?? '',
            dark: (await getSetting('tiles.dark')) ?? '',
            satellite: (await getSetting('tiles.satellite')) ?? ''
        },
        camera: {
            kind: (await getSetting('camera.kind')) ?? 'pi',
            url: (await getSetting('camera.url')) ?? '',
            device: (await getSetting('camera.device')) ?? '/dev/video0'
        },
        ai: {
            baseUrl: (await getSetting('ai.baseUrl')) ?? '',
            model: (await getSetting('ai.model')) ?? '',
            keySet: Boolean((await getSetting('ai.apiKey')) ?? process.env.AI_API_KEY)
        },
        mavlink: {
            signingKeySet: Boolean((await getSetting('mavlink.signingKey')) ?? process.env.MAVLINK_SIGNING_KEY),
            signingLinkId: (await getSetting('mavlink.signingLinkId')) ?? '1',
            signingStrict: (await getSetting('mavlink.signingStrict')) === 'true'
        },
        failsafe: {
            lostOperatorMinutes: Number((await getSetting('failsafe.lostOperatorMinutes')) ?? 0)
        }
    });
};

export const POST: RequestHandler = async (event) => {
    if (!event.locals.user) return json({ message: m.api_unauthorized() }, 401);

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

    // Map tile settings are public config, so a blank value clears the override.
    if (typeof body.maptiler === 'string') await setSetting('integration.maptiler', body.maptiler.trim());
    if (typeof body.uiLocale === 'string' && isLocale(body.uiLocale)) await setSetting('ui.locale', body.uiLocale);
    const tiles = body.tiles ?? {};
    if (typeof tiles.light === 'string') await setSetting('tiles.light', tiles.light.trim());
    if (typeof tiles.dark === 'string') await setSetting('tiles.dark', tiles.dark.trim());
    if (typeof tiles.satellite === 'string') await setSetting('tiles.satellite', tiles.satellite.trim());

    // The live-feed camera source is applied to MediaMTX after it is stored, so
    // the operator's pick takes effect without touching a file or the stack.
    let cameraApplied: boolean | null = null;
    const camera = body.camera ?? {};
    if (typeof camera.kind === 'string') {
        await setSetting('camera.kind', camera.kind);
        if (typeof camera.url === 'string') await setSetting('camera.url', camera.url.trim());
        if (typeof camera.device === 'string') await setSetting('camera.device', camera.device.trim());
        cameraApplied = await applyCameraSource({
            kind: camera.kind as CameraSourceKind,
            url: typeof camera.url === 'string' ? camera.url.trim() : '',
            device: typeof camera.device === 'string' ? camera.device.trim() : '/dev/video0'
        });
    }

    const ai = body.ai ?? {};
    if (typeof ai.apiKey === 'string' && ai.apiKey.length > 0) await setSetting('ai.apiKey', ai.apiKey.trim());
    if (typeof ai.baseUrl === 'string') await setSetting('ai.baseUrl', ai.baseUrl.trim());
    if (typeof ai.model === 'string') await setSetting('ai.model', ai.model.trim());

    // MAVLink signing: the passphrase is a secret (blank keeps the stored one),
    // link id and strict flag are plain config. Reload the live link config so
    // the change takes effect without a restart.
    const mavlink = body.mavlink ?? {};
    let mavlinkChanged = false;
    let signingKeySet = false;
    if (typeof mavlink.signingKey === 'string' && mavlink.signingKey.length > 0) {
        await setSetting('mavlink.signingKey', mavlink.signingKey.trim());
        mavlinkChanged = true;
        signingKeySet = true;
    }
    if (mavlink.signingLinkId !== undefined) {
        await setSetting('mavlink.signingLinkId', String(mavlink.signingLinkId));
        mavlinkChanged = true;
    }
    if (mavlink.signingStrict !== undefined) {
        await setSetting('mavlink.signingStrict', mavlink.signingStrict ? 'true' : 'false');
        mavlinkChanged = true;
    }
    if (typeof mavlink.clearSigningKey === 'boolean' && mavlink.clearSigningKey) {
        await setSetting('mavlink.signingKey', '');
        mavlinkChanged = true;
    }
    if (mavlinkChanged) await refreshSigningConfig();
    // Push the new key to the connected vehicle so both ends share it from one save.
    const signingPushed = signingKeySet ? await provisionVehicleSigning() : null;

    const failsafe = body.failsafe ?? {};
    if (failsafe.lostOperatorMinutes !== undefined) {
        const minutes = Math.max(0, Math.round(Number(failsafe.lostOperatorMinutes) || 0));
        await setSetting('failsafe.lostOperatorMinutes', String(minutes));
    }

    return json({ message: m.api_saved(), cameraApplied, signingPushed });
};
