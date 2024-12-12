import type { Handle } from '@sveltejs/kit';
import PocketBase from 'pocketbase';
import { authData } from './stores/authStore';

export const handle: Handle = async ({ event, resolve }) => {
  // Create PocketBase instance for each server-side request
  // Use the full URL to ensure correct port
  const pbUrl = `http://${event.url.hostname === 'localhost' ? 'localhost' : event.url.hostname}:8090`;
  // console.log('PocketBase URL:', pbUrl);
  
  event.locals.pb = new PocketBase(pbUrl);
  event.locals.pb.autoCancellation(false);
  
  // Optional: Load user if authenticated
  const cookie = event.request.headers.get('cookie');
  // console.log('Received cookie:', cookie);
  
  if (cookie) {
    try {
      event.locals.pb.authStore.loadFromCookie(cookie);
      
      // console.log('Auth store after loading cookie:', {
      //   isValid: event.locals.pb.authStore.isValid,
      //   model: event.locals.pb.authStore.model,
      //   token: event.locals.pb.authStore.token
      // });
      
      // Refresh the authentication if possible
      if (event.locals.pb.authStore.isValid) {
        await event.locals.pb.collection('users').authRefresh();
        
        // Flexible auth data conversion
        const authDataToStore = {
          [event.locals.pb.authStore.model?.collectionName === 'admins' ? 'admin' : 'record']: 
            event.locals.pb.authStore.model,
          token: event.locals.pb.authStore.token,
          expires: event.locals.pb.authStore.model?.['expires'] || Date.now() + (24 * 60 * 60 * 1000),
        };
        
        // Sync with client-side store
        authData.set(authDataToStore);
      }
    } catch (error) {
      // Invalid or expired token
      console.error('Error loading auth from cookie:', error);
      event.locals.pb.authStore.clear();
      authData.set(null); // Clear client-side store as well
    }
  }

  const response = await resolve(event);

  // Add the authentication cookie to the response
  const authCookie = event.locals.pb.authStore.exportToCookie({ httpOnly: false });
  // console.log('Setting auth cookie:', authCookie);
  response.headers.append('set-cookie', authCookie);

  return response;
};