import { writable } from 'svelte/store';

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
export const primaryColorStore = writable('#1c1c1e'); // Light theme: #ffffff, See routes/+layout.svelte: toggleDarkMode()
export const secondaryColorStore = writable('#121212'); // Light theme: #e7e9ef, See routes/+layout.svelte: toggleDarkMode()
export const tertiaryColorStore = writable('#2d2d2d'); // Light theme: #d7d7d7, See routes/+layout.svelte: toggleDarkMode()