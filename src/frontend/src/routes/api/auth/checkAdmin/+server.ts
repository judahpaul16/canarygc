import type { RequestHandler } from '@sveltejs/kit';
import { createClient } from "@libsql/client";

export const POST: RequestHandler = async (event): Promise<Response> => {
    let client = createClient({ url: 'file:src/stores/data.db' });
    let adminExists = false;
    await client.execute("SELECT * FROM user").then((result) => {
        if (result.rows.length > 0) {
            adminExists = true;
        }
    });
    return new Response(JSON.stringify({ adminExists: adminExists }), {
        status: 200,
        headers: {
            "content-type": "application/json"
        }
    });
}
