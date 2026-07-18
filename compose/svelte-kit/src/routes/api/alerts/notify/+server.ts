import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getEnabledAlerts } from '$lib/server/settings';
import { sendMail, isSmtpConfigured } from '$lib/server/mailer';
import { ALERT_TYPES, type AlertPayload, type AlertTelemetry } from '$lib/alert-types';
import { m } from '$lib/paraglide/messages';
import { operatorLocale } from '$lib/server/locale';
import type { Locale } from '$lib/paraglide/runtime';

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

function num(value: number, locale: Locale, digits = 1): string {
    return Number.isFinite(value) ? value.toFixed(digits) : m.email_na(undefined, { locale });
}

// Composes the event line in the operator's locale from the raw params the
// client sent, so the email never carries the browser's UI language.
function eventDescription(payload: AlertPayload, locale: Locale): string {
    const p = payload.params;
    switch (payload.type) {
        case 'crash': return m.alert_evt_crash({ alt: p.alt }, { locale });
        case 'armed': return m.alert_evt_armed(undefined, { locale });
        case 'disarmed': return m.alert_evt_disarmed(undefined, { locale });
        case 'mode': return m.alert_evt_mode({ mode: p.mode }, { locale });
        case 'mission_complete': return m.alert_evt_mission_complete(undefined, { locale });
        case 'failsafe': return m.alert_evt_failsafe(undefined, { locale });
        case 'emergency': return m.alert_evt_emergency(undefined, { locale });
        case 'battery_critical': return m.alert_evt_battery_critical({ percent: p.percent }, { locale });
        case 'battery_low': return m.alert_evt_battery_low({ percent: p.percent }, { locale });
        case 'gps_acquired': return m.alert_evt_gps_acquired({ sats: p.sats }, { locale });
        case 'gps_lost': return m.alert_evt_gps_lost({ sats: p.sats }, { locale });
        case 'link_restored': return m.alert_evt_link_restored(undefined, { locale });
        case 'link_lost': return m.alert_evt_link_lost(undefined, { locale });
        default: return '';
    }
}

function buildEmail(label: string, description: string, t: AlertTelemetry, locale: Locale) {
    const when = new Date().toUTCString();
    const mapUrl = `https://maps.google.com/?q=${t.lat},${t.lon}`;
    const yesNo = (v: boolean) => (v ? m.email_yes(undefined, { locale }) : m.email_no(undefined, { locale }));
    const rows: [string, string][] = [
        [m.email_time(undefined, { locale }), when],
        [m.email_coordinates(undefined, { locale }), `${t.lat.toFixed(6)}, ${t.lon.toFixed(6)}`],
        [m.email_altitude(undefined, { locale }), `${num(t.altitude, locale)} m`],
        [m.email_ground_speed(undefined, { locale }), `${num(t.speed, locale)} m/s`],
        [m.email_heading(undefined, { locale }), `${num(t.heading, locale, 0)} deg`],
        [m.email_battery(undefined, { locale }), t.battery === null ? m.email_na(undefined, { locale }) : `${t.battery}%`],
        [m.email_flight_mode(undefined, { locale }), t.mode],
        [m.email_armed(undefined, { locale }), yesNo(t.armed)],
        [m.email_system_state(undefined, { locale }), t.state],
        [m.email_gps(undefined, { locale }), m.email_gps_value({ sats: t.satellites, hdop: num(t.hdop, locale, 1) }, { locale })],
        [m.email_vehicle(undefined, { locale }), `${t.model} (${t.type})`],
        [m.email_link(undefined, { locale }), t.online ? m.email_online(undefined, { locale }) : m.email_offline(undefined, { locale })]
    ];

    const text = `${label}\n\n${description}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${m.email_map(undefined, { locale })}: ${mapUrl}`;

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
  <p style="margin:18px 0 0;"><a href="${mapUrl}" style="color:#c99700;">${esc(m.email_view_map(undefined, { locale }))}</a></p>
  <p style="margin:18px 0 0;color:#9a9a9a;font-size:12px;">${esc(m.email_sent_by(undefined, { locale }))}</p>
</div>`;

    return { subject: `[CanaryGC] ${label}`, text, html };
}

export const POST: RequestHandler = async (event) => {
    if (!event.locals.user) return json({ message: m.api_unauthorized() }, 401);

    const payload = (await event.request.json()) as AlertPayload;
    const meta = ALERT_TYPES.find((a) => a.id === payload.type);
    if (!meta) return json({ skipped: 'unknown type' }, 200);

    const enabled = await getEnabledAlerts();
    if (!enabled.has(payload.type)) return json({ skipped: 'disabled' }, 200);

    const to = await operatorEmail(event.locals.user.id);
    if (!to) return json({ skipped: 'no recipient' }, 200);
    if (!(await isSmtpConfigured())) return json({ skipped: 'smtp not configured' }, 200);

    const locale = await operatorLocale();
    const label = meta.label(undefined, { locale });
    const { subject, text, html } = buildEmail(label, eventDescription(payload, locale), payload.telemetry, locale);

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
