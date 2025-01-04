import { lucia } from "$lib/server/auth";
import { redirect } from "@sveltejs/kit";
import { generateId } from "lucia";
import { hash } from "@node-rs/argon2";
import { SqliteError } from "libsql";
import { db } from "$lib/server/db";
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async (event): Promise<Response> => {
    const headers = event.request.headers;
    const username = headers.get("username");
    const password = headers.get("password");
    if (
        typeof username !== "string" ||
        username.length < 3 ||
        username.length > 31
    ) {
        return new Response(JSON.stringify({ message: "Invalid username" }), {
            status: 400,
            headers: {
                "content-type": "application/json"
            }
        });
    }
    if (typeof password !== "string" || password.length < 6 || password.length > 255) {
        return new Response(JSON.stringify({ message: "Invalid password" }), {
            status: 400,
            headers: {
                "content-type": "application/json"
            }
        });
    }

    const passwordHash = await hash(password, {
        // recommended minimum parameters
        memoryCost: 19456,
        timeCost: 2,
        outputLen: 32,
        parallelism: 1
    });
    const userId = generateId(15);

    try {
        db.prepare("INSERT INTO user (id, username, password_hash) VALUES(?, ?, ?)").run(
            userId,
            username,
            passwordHash
        );
        const session = event.locals.session;
        if (session) {
            const sessionCookie = lucia.createSessionCookie(session.id);
            event.cookies.set(sessionCookie.name, sessionCookie.value, {
                path: ".",
                ...sessionCookie.attributes
            });
        }
    } catch (e: any) {
        if (e instanceof SqliteError && e.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return new Response(JSON.stringify({ message: "Username already taken" }), {
                status: 400,
                headers: {
                    "content-type": "application/json"
                }
            });
        }
        return new Response(JSON.stringify({ message: e.stack }), {
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
