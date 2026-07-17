import { lucia, secureCookie } from "$lib/server/auth";
import { redirect } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { paraglideMiddleware } from "$lib/paraglide/server";
// Booting the MAVLink module starts its link supervisor with the server, so
// the station holds the autopilot connection without a browser session open.
// The operator-failsafe module starts its lost-operator watchdog the same way.
import "$lib/server/mavlink";
import "$lib/server/operator-failsafe";
import { initCameraSource } from "$lib/server/mediamtx";

const PUBLIC_PAGES = new Set(["/", "/login", "/register", "/version", "/forgot-password", "/reset-password"]);
const PUBLIC_API_PREFIX = "/api/auth/";

function isPublic(pathname: string): boolean {
	if (PUBLIC_PAGES.has(pathname)) return true;
	return pathname.startsWith(PUBLIC_API_PREFIX);
}

const handleAuth: Handle = async ({ event, resolve }) => {
	// Re-apply the saved camera source to MediaMTX once the DB is ready; guarded
	// to run a single time per process.
	void initCameraSource();

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
				...sessionCookie.attributes,
				secure: secureCookie(event)
			});
		}
		if (!session) {
			const sessionCookie = lucia.createBlankSessionCookie();
			event.cookies.set(sessionCookie.name, sessionCookie.value, {
				path: ".",
				...sessionCookie.attributes,
				secure: secureCookie(event)
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

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace("%lang%", locale)
		});
	});

// Paraglide first so the locale is set before the auth handle emits its 401 JSON.
export const handle = sequence(handleParaglide, handleAuth);
