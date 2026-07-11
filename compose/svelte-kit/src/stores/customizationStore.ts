import { writable, derived } from 'svelte/store';

function persistedBool(key: string, fallback: boolean) {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  const store = writable(stored === null ? fallback : stored === 'true');
  if (typeof localStorage !== 'undefined') {
    store.subscribe((value) => localStorage.setItem(key, String(value)));
  }
  return store;
}

export const audioCalloutsStore = persistedBool('audioCallouts', true);
export const darkModeStore = writable(true);

export const primaryColorStore = derived(darkModeStore, ($dark) => ($dark ? '#1c1c1e' : '#ffffff'));
export const secondaryColorStore = derived(darkModeStore, ($dark) => ($dark ? '#121212' : '#e7e9ef'));
export const tertiaryColorStore = derived(darkModeStore, ($dark) => ($dark ? '#2d2d2d' : '#d7d7d7'));