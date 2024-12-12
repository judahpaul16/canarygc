import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, locals }) => {
  const { email, password, action } = await request.json();

  try {
    switch (action) {
      case 'login':
        // Attempt admin login
        console.log('Attempting admin login for:', email);
        const authData = await locals.pb.admins.authWithPassword(email, password);
        
        console.log('Admin login successful:', {
          id: authData.admin?.id,
          email: authData.admin?.email,
          token: locals.pb.authStore.token
        });

        return json({ 
          success: true, 
          message: 'Admin login successful',
          admin: {
            id: authData.admin?.id,
            email: authData.admin?.email
          }
        });
      
      case 'logout':
        // Clear the authentication
        console.log('Logging out admin');
        locals.pb.authStore.clear();
        return json({ success: true, message: 'Logged out successfully' });
      
      default:
        throw error(400, 'Invalid action');
    }
  } catch (err) {
    // Log the error for debugging
    console.error('Authentication error:', err);
    
    // Throw a 401 Unauthorized error with more details
    throw error(401, {
      message: `Authentication failed: ${err instanceof Error ? err.message : 'Unknown error'}`
    });
  }
};
