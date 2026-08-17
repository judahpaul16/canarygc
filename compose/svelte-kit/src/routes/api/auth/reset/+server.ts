import { lucia, ARGON2_OPTIONS } from "$lib/server/auth";
import { hash } from "@node-rs/argon2";
import { db } from "$lib/server/db";
import { createHash } from "node:crypto";
import type { RequestHandler } from '@sveltejs/kit';
import { m } from '$lib/paraglide/messages';

const PASSWORD_MIN = 6;
const PASSWORD_MAX = 255;

function json(message: string, status: number): Response {
    return new Response(JSON.stringify({ message }), {
        status,
        headers: { "content-type": "application/json" }
    });
}

export const POST: RequestHandler = async (event): Promise<Response> => {
    const body = await event.request.json().catch(() => ({}));
    const token = body.token;
    const password = body.password;

    if (typeof password !== "string" || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
        return json(m.api_invalid_password(), 400);
    }
    if (typeof token !== "string" || token.length === 0) {
        return json(m.api_reset_link_invalid(), 400);
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const result = await db.execute({
        sql: "SELECT user_id, expires_at FROM password_reset WHERE token_hash = ?",
        args: [tokenHash]
    });
    const row = result.rows[0] as unknown as { user_id: string; expires_at: number } | undefined;

    if (!row || Number(row.expires_at) < Date.now()) {
        if (row) await db.execute({ sql: "DELETE FROM password_reset WHERE token_hash = ?", args: [tokenHash] });
        return json(m.api_reset_link_invalid(), 400);
    }

    const passwordHash = await hash(password, ARGON2_OPTIONS);
    await db.execute({ sql: "UPDATE user SET password_hash = ? WHERE id = ?", args: [passwordHash, row.user_id] });
    await db.execute({ sql: "DELETE FROM password_reset WHERE user_id = ?", args: [row.user_id] });
    await lucia.invalidateUserSessions(row.user_id);

    return json(m.api_success(), 200);
};
