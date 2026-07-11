import { lucia } from "$lib/server/auth";
import { hash } from "@node-rs/argon2";
import { db } from "$lib/server/db";
import { createHash } from "node:crypto";
import type { RequestHandler } from '@sveltejs/kit';

const ARGON2_OPTIONS = {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1
};

const PASSWORD_MIN = 6;
const PASSWORD_MAX = 255;

function json(message: string, status: number): Response {
    return new Response(JSON.stringify({ message }), {
        status,
        headers: { "content-type": "application/json" }
    });
}

export const POST: RequestHandler = async (event): Promise<Response> => {
    const token = event.request.headers.get("token");
    const password = event.request.headers.get("password");

    if (typeof password !== "string" || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
        return json("Password must be between 6 and 255 characters.", 400);
    }
    if (typeof token !== "string" || token.length === 0) {
        return json("This reset link is invalid or has expired.", 400);
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const result = await db.execute({
        sql: "SELECT user_id, expires_at FROM password_reset WHERE token_hash = ?",
        args: [tokenHash]
    });
    const row = result.rows[0] as unknown as { user_id: string; expires_at: number } | undefined;

    if (!row || Number(row.expires_at) < Date.now()) {
        if (row) await db.execute({ sql: "DELETE FROM password_reset WHERE token_hash = ?", args: [tokenHash] });
        return json("This reset link is invalid or has expired.", 400);
    }

    const passwordHash = await hash(password, ARGON2_OPTIONS);
    await db.execute({ sql: "UPDATE user SET password_hash = ? WHERE id = ?", args: [passwordHash, row.user_id] });
    await db.execute({ sql: "DELETE FROM password_reset WHERE user_id = ?", args: [row.user_id] });
    await lucia.invalidateUserSessions(row.user_id);

    return json("Success", 200);
};
