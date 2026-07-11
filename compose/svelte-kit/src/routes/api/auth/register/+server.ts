import { lucia } from "$lib/server/auth";
import { generateId } from "lucia";
import { hash } from "@node-rs/argon2";
import { db } from "$lib/server/db";
import type { RequestHandler } from '@sveltejs/kit';

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
const USER_ID_LENGTH = 15;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: RequestHandler = async (event): Promise<Response> => {
    const headers = event.request.headers;
    const username = headers.get("username");
    const password = headers.get("password");
    const email = headers.get("email");
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
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
        return new Response(JSON.stringify({ message: "Invalid email" }), {
            status: 400,
            headers: {
                "content-type": "application/json"
            }
        });
    }

    // Registration provisions the single operator account on first run;
    // once any account exists, new signups are refused.
    const existing = await db.execute("SELECT id FROM user LIMIT 1");
    if (existing.rows.length > 0) {
        return new Response(JSON.stringify({ message: "Registration is closed: an operator account already exists" }), {
            status: 403,
            headers: {
                "content-type": "application/json"
            }
        });
    }

    const passwordHash = await hash(password, ARGON2_OPTIONS);
    const userId = generateId(USER_ID_LENGTH);

    try {
        await db.execute({
            sql: "INSERT INTO user (id, username, password_hash, email) VALUES(?, ?, ?, ?)",
            args: [userId, username, passwordHash, email]
        });
        const session = await lucia.createSession(userId, {});
        const sessionCookie = lucia.createSessionCookie(session.id);
        event.cookies.set(sessionCookie.name, sessionCookie.value, {
            path: "/",
            ...sessionCookie.attributes
        });
    } catch (e) {
        return new Response(JSON.stringify({ message: (e as Error).stack }), {
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
