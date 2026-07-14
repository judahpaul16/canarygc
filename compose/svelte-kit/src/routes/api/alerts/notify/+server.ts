import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getEnabledAlerts } from '$lib/server/settings';
import { sendMail, isSmtpConfigured } from '$lib/server/mailer';
import { ALERT_TYPES, type AlertPayload, type AlertTelemetry } from '$lib/alert-types';

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

async function operatorEmail(userId: string): Promise<string> {
    const result = await db.execute({ sql: 'SELECT email FROM user WHERE id = ?', args: [userId] });
    const row = result.rows[0] as unknown as { email: string | null } | undefined;
    return row?.email ?? '';
}

const HTML_ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(value: string): string {
    return value.replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
}

function num(value: number, digits = 1): string {
    return Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

function buildEmail(label: string, description: string, t: AlertTelemetry) {
    const when = new Date().toUTCString();
    const mapUrl = `https://maps.google.com/?q=${t.lat},${t.lon}`;
    const rows: [string, string][] = [
        ['Time', when],
        ['Coordinates', `${t.lat.toFixed(6)}, ${t.lon.toFixed(6)}`],
        ['Altitude', `${num(t.altitude)} m`],
        ['Ground speed', `${num(t.speed)} m/s`],
        ['Heading', `${num(t.heading, 0)} deg`],
        ['Battery', t.battery === null ? 'n/a' : `${t.battery}%`],
        ['Flight mode', t.mode],
        ['Armed', t.armed ? 'yes' : 'no'],
        ['System state', t.state],
        ['GPS', `${t.satellites} sats, HDOP ${num(t.hdop, 1)}`],
        ['Vehicle', `${t.model} (${t.type})`],
        ['Link', t.online ? 'online' : 'offline']
    ];

    const text = `${label}\n\n${description}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nMap: ${mapUrl}`;

    const htmlRows = rows
        .map(
            ([k, v]) =>
                `<tr><td style="padding:4px 14px 4px 0;color:#8a8a8a;white-space:nowrap;">${esc(k)}</td><td style="padding:4px 0;font-weight:600;">${esc(v)}</td></tr>`
        )
        .join('');
    const html = `<div style="font-family:system-ui,-apple-system,sans-serif;color:#141414;max-width:520px;">
  <h2 style="margin:0 0 4px;font-size:18px;">${esc(label)}</h2>
  <p style="margin:0 0 18px;color:#555;">${esc(description)}</p>
  <table style="border-collapse:collapse;font-size:14px;">${htmlRows}</table>
  <p style="margin:18px 0 0;"><a href="${mapUrl}" style="color:#c99700;">View location on map</a></p>
  <p style="margin:18px 0 0;color:#9a9a9a;font-size:12px;">Sent by CanaryGC.</p>
</div>`;

    return { subject: `[CanaryGC] ${label}`, text, html };
}

export const POST: RequestHandler = async (event) => {
    if (!event.locals.user) return json({ message: 'Unauthorized' }, 401);

    const payload = (await event.request.json()) as AlertPayload;
    const meta = ALERT_TYPES.find((a) => a.id === payload.type);
    if (!meta) return json({ skipped: 'unknown type' }, 200);

    const enabled = await getEnabledAlerts();
    if (!enabled.has(payload.type)) return json({ skipped: 'disabled' }, 200);

    const to = await operatorEmail(event.locals.user.id);
    if (!to) return json({ skipped: 'no recipient' }, 200);
    if (!(await isSmtpConfigured())) return json({ skipped: 'smtp not configured' }, 200);

    const { subject, text, html } = buildEmail(meta.label, payload.description, payload.telemetry);

    // Retry with backoff so a transient uplink drop (common on a cellular link)
    // does not lose the alert. Crash and failsafe alerts are worth a few seconds.
    const MAX_ATTEMPTS = 4;
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            await sendMail({ to, subject, text, html });
            return json({ sent: true, attempts: attempt }, 200);
        } catch (e) {
            lastError = e as Error;
            if (attempt < MAX_ATTEMPTS) {
                await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
            }
        }
    }
    console.error('Alert email failed after retries:', lastError?.message);
    return json({ message: 'send failed after retries' }, 500);
};
