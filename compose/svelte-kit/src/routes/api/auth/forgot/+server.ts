import { db } from "$lib/server/db";
import { sendMail } from "$lib/server/mailer";
import { randomBytes, createHash } from "node:crypto";
import type { RequestHandler } from '@sveltejs/kit';
import type { DatabaseUser } from "$lib/server/db";

const RESET_TTL_MS = 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(message: string, status: number): Response {
    return new Response(JSON.stringify({ message }), {
        status,
        headers: { "content-type": "application/json" }
    });
}

export const POST: RequestHandler = async (event): Promise<Response> => {
    const body = await event.request.json().catch(() => ({}));
    const email = body.email;
    const generic = json("If that email is on file, a reset link is on its way.", 200);
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
    try {
        await sendMail({
            to: email,
            subject: "Reset your CanaryGC password",
            text: `A password reset was requested for your CanaryGC operator account.\n\nReset your password: ${link}\n\nThis link expires in one hour. If you did not request it, ignore this email.`,
            html: `<p>A password reset was requested for your CanaryGC operator account.</p><p><a href="${link}">Reset your password</a></p><p>This link expires in one hour. If you did not request it, ignore this email.</p>`
        });
    } catch (e) {
        console.error("Password reset email failed:", (e as Error).message);
        return json("Email could not be sent. Check the SMTP settings under Integrations.", 500);
    }

    return generic;
};
