import { writable } from 'svelte/store';

type AuthData = {
  user?: {
    id: string;
    email: string;
    name: string;
  } | null;
  token: string;
  expires: number;
} | null;

function createAuthStore() {
  let initialAuthData: AuthData = null;
  
  if (typeof window !== 'undefined') {
    const savedAuthData = localStorage.getItem('authData');
    initialAuthData = savedAuthData ? JSON.parse(savedAuthData) : null;
  }
  const { subscribe, set, update } = writable<AuthData>(initialAuthData);

  // Subscribe to store changes to update localStorage
  subscribe(value => {
    if (typeof window !== 'undefined') {
      if (value) {
        localStorage.setItem('authData', JSON.stringify(value));
      } else {
        localStorage.removeItem('authData');
      }
    }
  });

  return {
    subscribe,
    set,
    update,
    registerAdmin: async (email: string, password: string, passwordConfirm: string) => {
      try {
        const response = await fetch('http://localhost:8090/api/register', {
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
        const response = await fetch('http://localhost:8090/api/login', {
          method: 'POST',
          body: JSON.stringify({ 
            email, 
            password 
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
        
        // Update the auth store with the login result
        set(result);
        
        return result;
      } catch (error) {
        console.error('Login error:', error);
        throw error;
      }
    },
    logout: async () => {
      try {
        const response = await fetch('http://localhost:8090/api/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });
    

        if (!response.ok) {
          throw new Error('Logout failed');
        }

        const result = await response.json();
        
        // Clear the auth store on logout
        set(null);
        
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
      let isExpired = (typeof window === 'undefined' || !localStorage.getItem('authData')) ? true : false;
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