import { writable, type Writable } from 'svelte/store';

// The initial subscribe notification is skipped so the key only appears in
// sessionStorage after an actual set; hasSessionValue then distinguishes a
// choice made this session from an untouched default.
function persistOnChange<T>(store: Writable<T>, key: string) {
  if (typeof sessionStorage === 'undefined') return;
  let initializing = true;
  store.subscribe((value) => {
    if (initializing) {
      initializing = false;
      return;
    }
    sessionStorage.setItem(key, String(value));
  });
}

export function sessionBool(key: string, fallback: boolean): Writable<boolean> {
  const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;
  const store = writable(raw === null ? fallback : raw === 'true');
  persistOnChange(store, key);
  return store;
}

export function sessionString(key: string, fallback: string): Writable<string> {
  const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;
  const store = writable(raw ?? fallback);
  persistOnChange(store, key);
  return store;
}

export function hasSessionValue(key: string): boolean {
  return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key) !== null;
}
