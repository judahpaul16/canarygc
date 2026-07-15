import { Lucia } from "lucia";
import { LibSQLAdapter } from "@lucia-auth/adapter-sqlite";
import { db } from "./db";

import type { RequestEvent } from "@sveltejs/kit";
import type { DatabaseUser } from "./db";

const adapter = new LibSQLAdapter(db, {
	user: "user",
	session: "session"
});

export const lucia = new Lucia(adapter, {
	getUserAttributes: (attributes) => {
		return {
			username: attributes.username
		};
	}
});

// The session cookie is marked Secure only when the request actually arrived
// over HTTPS, honoring an upstream proxy's X-Forwarded-Proto. A Secure cookie is
// never stored over plain HTTP, so a fixed secure flag would drop the session on
// a LAN host or behind an HTTP reverse proxy.
export function secureCookie(event: RequestEvent): boolean {
	const forwarded = event.request.headers.get("x-forwarded-proto");
	const proto = (forwarded?.split(",")[0].trim() || event.url.protocol.replace(":", "")).toLowerCase();
	return proto === "https";
}

declare module "lucia" {
	interface Register {
		Lucia: typeof lucia;
		DatabaseUserAttributes: Omit<DatabaseUser, "id">;
	}
}
