import { writable } from "svelte/store";

export const notificationCountStore = writable<number>(0);