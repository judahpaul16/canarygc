import { writable } from 'svelte/store';

export const darkModeStore = writable(true);
export const primaryColorStore = writable('#1c1c1e');
export const secondaryColorStore = writable('#121212');
export const tertiaryColorStore = writable('#2d2d2d');