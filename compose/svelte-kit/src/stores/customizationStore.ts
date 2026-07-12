import { writable } from 'svelte/store';

function persistedBool(key: string, fallback: boolean) {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  const store = writable(stored === null ? fallback : stored === 'true');
  if (typeof localStorage !== 'undefined') {
    store.subscribe((value) => localStorage.setItem(key, String(value)));
  }
  return store;
}

function persistedString(key: string, fallback: string) {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  const store = writable(stored ?? fallback);
  if (typeof localStorage !== 'undefined') {
    store.subscribe((value) => localStorage.setItem(key, value));
  }
  return store;
}

export const audioCalloutsStore = persistedBool('audioCallouts', true);
export const darkModeStore = persistedBool('darkMode', true);
export const mavIconStore = persistedString('mavIcon', '/map/here.png');