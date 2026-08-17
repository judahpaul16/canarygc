import type { RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { db } from "$lib/server/db";

const TITLED_TYPES = new Set(['save', 'load', 'checkExists', 'update', 'delete']);

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" }
    });
}

export const POST: RequestHandler = async (event): Promise<Response> => {
    const body = await event.request.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title : null;
    const actions = body.actions === undefined ? null : JSON.stringify(body.actions);

    if (TITLED_TYPES.has(event.params.type ?? '') && !title) {
        return new Response("Missing title", { status: 400 });
    }

    try {
        switch (event.params.type) {
            case 'save':
                await db.execute({
                    sql: "INSERT INTO mission (id, title, actions, isLoaded) VALUES (?, ?, ?, ?)",
                    args: [randomUUID(), title, actions, false]
                });
                return json({ message: "Success" });
            case 'load':
                await db.execute({ sql: "UPDATE mission SET isLoaded = true WHERE title = ?", args: [title] });
                return json({});
            case 'unload':
                await db.execute({ sql: "UPDATE mission SET isLoaded = false", args: [] });
                return json({});
            case 'checkExists': {
                const result = await db.execute({ sql: "SELECT * FROM mission WHERE title = ?", args: [title] });
                return json(result.rows.length > 0 ? result.rows : {});
            }
            case 'update':
                await db.execute({ sql: "UPDATE mission SET actions = ? WHERE title = ?", args: [actions, title] });
                return json({});
            case 'list': {
                const result = await db.execute("SELECT * FROM mission");
                return json(result.rows.length > 0 ? result.rows : {});
            }
            case 'delete':
                await db.execute({ sql: "DELETE FROM mission WHERE title = ?", args: [title] });
                return json({});
            default:
                return new Response(`Invalid request type: ${event.params.type}`, { status: 400 });
        }
    } catch (err) {
        console.error(err);
        return new Response(`Error: ${(err as Error).message}`, { status: 500 });
    }
};
