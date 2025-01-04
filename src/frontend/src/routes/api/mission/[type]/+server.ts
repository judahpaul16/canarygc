import type { RequestHandler } from '@sveltejs/kit';
import { createClient } from "@libsql/client";

export const POST: RequestHandler = async (event): Promise<Response> => {
    let client = createClient({ url: 'file:/app/src/data.db' });
    switch (event.params.type) {
        case 'save':
            try {
                let title = event.request.headers.get('title');
                let actions = event.request.headers.get('actions');
                client.execute({sql: "INSERT INTO mission (id, title, actions, isLoaded) VALUES (?, ?, ?, ?)", args: [Math.random().toString(36).replace('0.', ''), title, actions, false]}).then((result) => {
                    return new Response("Success", {
                        status: 200,
                        headers: {
                            "content-type": "application/json"
                        }
                    });
                });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        case 'load':
            try {
                let title = event.request.headers.get('title');
                await client.execute({sql: "UPDATE mission SET isLoaded = true WHERE title = ?", args: [title]});
                
                return new Response(JSON.stringify({}), {
                    status: 200,
                    headers: {
                        "content-type": "application/json"
                    }
                });

            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        case 'unload':
            try {
                let title = event.request.headers.get('title');
                client.execute({sql: "UPDATE mission SET isLoaded = false WHERE title = ?", args: [title]});
                
                return new Response(JSON.stringify({}), {
                    status: 200,
                    headers: {
                        "content-type": "application/json"
                    }
                });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        case 'checkExists':
            try {
                let title = event.request.headers.get('title');
                let result = await client.execute({sql: "SELECT * FROM mission WHERE title = ?", args: [title]});
                
                return new Response(JSON.stringify(result.rows.length > 0 ? result.rows[0] : {}), {
                    status: 200,
                    headers: {
                        "content-type": "application/json"
                    }
                });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        case ' update':
            try {
                let title = event.request.headers.get('title');
                let actions = event.request.headers.get('actions');
                client.execute({sql: "UPDATE mission SET actions = ? WHERE title = ?", args: [actions, title]});
                
                return new Response(JSON.stringify({}), {
                    status: 200,
                    headers: {
                        "content-type": "application/json"
                    }
                });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        case 'list':
            try {
                let result = await client.execute("SELECT * FROM mission");
                
                return new Response(JSON.stringify(result.rows.length > 0 ? result.rows : {}), {
                    status: 200,
                    headers: {
                        "content-type": "application/json"
                    }
                });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        case 'delete':
            try {
                let title = event.request.headers.get('title');
                client.execute({sql: "DELETE FROM mission WHERE title = ?", args: [title]});
                
                return new Response(JSON.stringify({}), {
                    status: 200,
                    headers: {
                        "content-type": "application/json"
                    }
                });
            } catch (err) {
                console.error(err);
                return new Response(`Error: ${(err as Error).stack}`, { status: 500 });
            }
        default:
            return new Response(`Invalid request type: ${event.params.type}`, { status: 400 });
    };
};