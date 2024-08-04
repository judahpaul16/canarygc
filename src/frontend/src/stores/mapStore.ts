import { writable } from 'svelte/store';

export const mapStore = writable<L.Map | null>(null);
