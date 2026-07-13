import { lucia } from "$lib/server/auth";
import { verify } from "@node-rs/argon2";
import { db } from "$lib/server/db";
import type { RequestHandler } from '@sveltejs/kit';
import { loginLockedMs, noteLoginFailure, clearLoginFailures } from "$lib/server/rate-limit";

import type { DatabaseUser } from "$lib/server/db";

function json(message: string, status: number, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify({ message }), {
        status,
        headers: { "content-type": "application/json", ...headers }
    });
}

const ARGON2_OPTIONS = {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1
};

const USERNAME_MIN = 3;
const USERNAME_MAX = 31;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 255;

export const POST: RequestHandler = async (event): Promise<Response> => {
    try {
        // Credentials travel in the JSON body: header values reject non-Latin-1
        // characters and are far more likely to land in proxy logs.
        const body = await event.request.json().catch(() => ({}));
        const username = body.username;
        const password = body.password;

        // Throttle brute force per client, falling back to the username when the
        // adapter cannot resolve an address.
        let rateKey: string;
        try {
            rateKey = event.getClientAddress();
        } catch {
            rateKey = `user:${typeof username === "string" ? username : ""}`;
        }
        const lockedMs = loginLockedMs(rateKey);
        if (lockedMs > 0) {
            return json("Too many failed attempts. Try again later.", 429, {
                "Retry-After": String(Math.ceil(lockedMs / 1000))
            });
        }

        if (
            typeof username !== "string" ||
            username.length < USERNAME_MIN ||
            username.length > USERNAME_MAX
        ) {
            return new Response(JSON.stringify({ message: "Invalid username" }), {
                status: 400,
                headers: {
                    "content-type": "application/json"
                }
            });
        }
        if (typeof password !== "string" || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
            return new Response(JSON.stringify({ message: "Invalid password" }), {
                status: 400,
                headers: {
                    "content-type": "application/json"
                }
            });
        }

        const result = await db.execute({ sql: "SELECT * FROM user WHERE username = ?", args: [username] });
        const existingUser = result.rows[0] as unknown as DatabaseUser | undefined;
        if (!existingUser) {
            noteLoginFailure(rateKey);
            return json("Incorrect username or password", 400);
        }

        const validPassword = await verify(existingUser.password_hash, password, ARGON2_OPTIONS);
        if (!validPassword) {
            noteLoginFailure(rateKey);
            return json("Incorrect username or password", 400);
        }

        clearLoginFailures(rateKey);
        const session = await lucia.createSession(existingUser.id, {});
        const sessionCookie = lucia.createSessionCookie(session.id);
        event.cookies.set(sessionCookie.name, sessionCookie.value, {
            path: "/",
            ...sessionCookie.attributes
        });
    } catch (e) {
        return new Response(JSON.stringify({ message: (e as Error).message }), {
            status: 500,
            headers: {
                "content-type": "application/json"
            }
        });
    }

    return new Response(JSON.stringify({ message: "Success" }), {
        status: 200,
        headers: {
            "content-type": "application/json"
        }
    });
}
