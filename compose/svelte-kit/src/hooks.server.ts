import { lucia } from "$lib/server/auth";
import { redirect } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit";

const PUBLIC_PAGES = new Set(["/", "/login", "/register"]);
const PUBLIC_API_PREFIX = "/api/auth/";

function isPublic(pathname: string): boolean {
	if (PUBLIC_PAGES.has(pathname)) return true;
	return pathname.startsWith(PUBLIC_API_PREFIX);
}

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get(lucia.sessionCookieName);
	if (!sessionId) {
		event.locals.user = null;
		event.locals.session = null;
	} else {
		const { session, user } = await lucia.validateSession(sessionId);
		if (session && session.fresh) {
			const sessionCookie = lucia.createSessionCookie(session.id);
			event.cookies.set(sessionCookie.name, sessionCookie.value, {
				path: ".",
				...sessionCookie.attributes
			});
		}
		if (!session) {
			const sessionCookie = lucia.createBlankSessionCookie();
			event.cookies.set(sessionCookie.name, sessionCookie.value, {
				path: ".",
				...sessionCookie.attributes
			});
		}
		event.locals.user = user;
		event.locals.session = session;
	}

	// Every non-public route requires a valid session: the MAVLink and
	// mission APIs command the vehicle, so they are never open to
	// unauthenticated callers on the network.
	const { pathname } = event.url;
	if (!event.locals.session && !isPublic(pathname)) {
		if (pathname.startsWith("/api/")) {
			return new Response(JSON.stringify({ message: "Unauthorized" }), {
				status: 401,
				headers: { "content-type": "application/json" }
			});
		}
		redirect(302, "/login");
	}

	return resolve(event);
};
