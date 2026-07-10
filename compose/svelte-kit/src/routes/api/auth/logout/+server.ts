import { lucia } from "$lib/server/auth";
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async (event): Promise<Response> => {
    if (event.locals.session) {
        await lucia.invalidateSession(event.locals.session.id);
    }
    const sessionCookie = lucia.createBlankSessionCookie();
    event.cookies.set(sessionCookie.name, sessionCookie.value, {
        path: "/",
        ...sessionCookie.attributes
    });
    return new Response(JSON.stringify({ message: "Logged out" }), {
        status: 200,
        headers: { "content-type": "application/json" }
    });
}
