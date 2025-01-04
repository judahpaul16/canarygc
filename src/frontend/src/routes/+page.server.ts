import { redirect } from "@sveltejs/kit";

import type { ServerLoad } from "@sveltejs/kit";

export const load: ServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, "/login");
	}
	return {
		user: event.locals.user
	};
};
