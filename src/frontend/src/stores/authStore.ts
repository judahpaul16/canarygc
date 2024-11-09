import { writable } from 'svelte/store';
import type { AdminAuthResponse, RecordAuthResponse, RecordModel } from 'pocketbase';

type AuthData = AdminAuthResponse | RecordAuthResponse<RecordModel> | null;

function createAuthStore() {
  let initialAuthData: AuthData = null;
  
  if (typeof window !== 'undefined') {
    const savedAuthData = localStorage.getItem('authData');
    initialAuthData = savedAuthData ? JSON.parse(savedAuthData) : null;
  }

  const { subscribe, set } = writable<AuthData>(initialAuthData);

  return {
    subscribe,
    set: (value: AuthData) => {
      if (typeof window !== 'undefined') {
        if (value) {
          localStorage.setItem('authData', JSON.stringify(value));
          localStorage.setItem('authTimestamp', Date.now().toString());
        } else {
          localStorage.removeItem('authData');
          localStorage.removeItem('authTimestamp');
        }
      }
      set(value);
    },
    checkExpired: () => {
      if (typeof window === 'undefined') return true;
      if (!localStorage.getItem('authData')) return true;

      const authTimestamp = localStorage.getItem('authTimestamp');
      if (!authTimestamp) return true;

      const now = Date.now();
      const expirationTime = 30 * 60 * 1000; // 30 minutes in milliseconds
      return now - parseInt(authTimestamp) > expirationTime;
    },
    refreshTimestamp: () => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('authTimestamp', Date.now().toString());
      }
    }
  };
}

export const authData = createAuthStore();