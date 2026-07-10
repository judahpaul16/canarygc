import type { RequestHandler } from '@sveltejs/kit';
import { createClient } from "@libsql/client";

export const POST: RequestHandler = async (): Promise<Response> => {
    const client = createClient({ url: 'file:/app/src/data.db' });
    const result = await client.execute("SELECT * FROM user");
    const adminExists = result.rows.length > 0;
    return new Response(JSON.stringify({ adminExists }), {
        status: 200,
        headers: {
            "content-type": "application/json"
        }
    });
}
