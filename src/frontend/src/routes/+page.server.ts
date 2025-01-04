import type { ServerLoad } from "@sveltejs/kit";

export const load: ServerLoad = async (event) => {
	if (!event.locals.user) {
		return;
	}
	return {
		user: event.locals.user
	};
};
