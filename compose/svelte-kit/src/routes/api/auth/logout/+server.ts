import { lucia, secureCookie } from "$lib/server/auth";
import type { RequestHandler } from '@sveltejs/kit';
import { m } from '$lib/paraglide/messages';

export const POST: RequestHandler = async (event): Promise<Response> => {
    if (event.locals.session) {
        await lucia.invalidateSession(event.locals.session.id);
    }
    const sessionCookie = lucia.createBlankSessionCookie();
    event.cookies.set(sessionCookie.name, sessionCookie.value, {
        path: "/",
        ...sessionCookie.attributes,
        secure: secureCookie(event)
    });
    return new Response(JSON.stringify({ message: m.api_logged_out() }), {
        status: 200,
        headers: { "content-type": "application/json" }
    });
}
