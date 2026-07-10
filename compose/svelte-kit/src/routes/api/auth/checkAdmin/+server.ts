import type { RequestHandler } from '@sveltejs/kit';
import { db } from "$lib/server/db";

export const POST: RequestHandler = async (): Promise<Response> => {
    const result = await db.execute("SELECT id FROM user LIMIT 1");
    const adminExists = result.rows.length > 0;
    return new Response(JSON.stringify({ adminExists }), {
        status: 200,
        headers: {
            "content-type": "application/json"
        }
    });
}
