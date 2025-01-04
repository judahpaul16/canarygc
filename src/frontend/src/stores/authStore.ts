import { writable } from "svelte/store";

export const loggedInStore = writable<boolean>(false);