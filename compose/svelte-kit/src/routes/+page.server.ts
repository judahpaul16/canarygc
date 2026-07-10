import type { ServerLoad } from "@sveltejs/kit";
import { db } from "$lib/server/db";

export const load: ServerLoad = async (event) => {
	const operator = await db.execute("SELECT id FROM user LIMIT 1");
	return {
		user: event.locals.user ?? null,
		operatorExists: operator.rows.length > 0
	};
};
