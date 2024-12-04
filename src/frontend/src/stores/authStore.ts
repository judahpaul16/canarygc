import { writable } from 'svelte/store';
import type { AdminAuthResponse, RecordAuthResponse, RecordModel } from 'pocketbase';

type AuthData = AdminAuthResponse | RecordAuthResponse<RecordModel> | null;

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthData>(null);

  return {
    subscribe,
    set,
    update,
    registerAdmin: async (email: string, password: string, passwordConfirm: string) => {
      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ 
            email, 
            password, 
            passwordConfirm 
          }),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Registration failed');
        }

        const result = await response.json();
        return result;
      } catch (error) {
        console.error('Registration error:', error);
        throw error;
      }
    },
    loginAdmin: async (email: string, password: string) => {
      try {
        const response = await fetch('/api/auth', {
          method: 'POST',
          body: JSON.stringify({ 
            email, 
            password, 
            action: 'login' 
          }),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Login failed');
        }

        const result = await response.json();
        return result;
      } catch (error) {
        console.error('Login error:', error);
        throw error;
      }
    },
    logout: async () => {
      try {
        const response = await fetch('/api/auth', {
          method: 'POST',
          body: JSON.stringify({ action: 'logout' }),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('Logout failed');
        }

        const result = await response.json();
        return result;
      } catch (error) {
        console.error('Logout error:', error);
        throw error;
      }
    },
    refreshTimestamp: () => {
      update(currentAuthData => {
        // If currentAuthData is not null, you might want to update some timestamp property
        // This is a placeholder - adjust according to your specific requirements
        if (currentAuthData) {
          return {
            ...currentAuthData,
            lastActiveTimestamp: Date.now()
          };
        }
        return currentAuthData;
      });
    },
    checkExpired: () => {
      let isExpired = false;
      update(currentAuthData => {
        // Check if the current auth data exists and has an expiration
        if (currentAuthData && 'expires' in currentAuthData) {
          // Compare current time with expiration time
          isExpired = Date.now() >= (currentAuthData.expires || 0);
          
          // If expired, you might want to clear the auth data
          if (isExpired) {
            return null;
          }
        }
        return currentAuthData;
      });
      return isExpired;
    },
  };
}

export const authData = createAuthStore();