import { db } from "$lib/server/db";
import { sendMail } from "$lib/server/mailer";
import { randomBytes, createHash } from "node:crypto";
import type { RequestHandler } from '@sveltejs/kit';
import type { DatabaseUser } from "$lib/server/db";
import { lockedMs, noteFailure } from "$lib/server/rate-limit";
import { m } from '$lib/paraglide/messages';
import { operatorLocale } from '$lib/server/locale';

const RESET_TTL_MS = 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(message: string, status: number): Response {
    return new Response(JSON.stringify({ message }), {
        status,
        headers: { "content-type": "application/json" }
    });
}

export const POST: RequestHandler = async (event): Promise<Response> => {
    const generic = json(m.api_reset_generic(), 200);

    // Cap reset requests per client so a known operator email cannot be flooded
    // with reset mail; a rate-limited client gets the same generic reply.
    let rateKey: string;
    try {
        rateKey = `forgot:${event.getClientAddress()}`;
    } catch {
        rateKey = "forgot:unknown";
    }
    if (lockedMs(rateKey) > 0) return generic;
    noteFailure(rateKey);

    const body = await event.request.json().catch(() => ({}));
    const email = body.email;
    if (typeof email !== "string" || !EMAIL_RE.test(email)) return generic;

    const result = await db.execute({ sql: "SELECT * FROM user WHERE email = ?", args: [email] });
    const user = result.rows[0] as unknown as DatabaseUser | undefined;
    if (!user) return generic;

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = Date.now() + RESET_TTL_MS;

    await db.execute({ sql: "DELETE FROM password_reset WHERE user_id = ?", args: [user.id] });
    await db.execute({
        sql: "INSERT INTO password_reset (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        args: [tokenHash, user.id, expiresAt]
    });

    const link = `${event.url.origin}/reset-password?token=${token}`;
    const locale = await operatorLocale();
    const intro = m.email_reset_body(undefined, { locale });
    const linkText = m.email_reset_link_text(undefined, { locale });
    const expiry = m.email_reset_expiry(undefined, { locale });
    try {
        await sendMail({
            to: email,
            subject: m.email_reset_subject(undefined, { locale }),
            text: `${intro}\n\n${linkText}: ${link}\n\n${expiry}`,
            html: `<p>${intro}</p><p><a href="${link}">${linkText}</a></p><p>${expiry}</p>`
        });
    } catch (e) {
        console.error("Password reset email failed:", (e as Error).message);
        return json(m.api_reset_email_failed(), 500);
    }

    return generic;
};
