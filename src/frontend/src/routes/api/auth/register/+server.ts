import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    // Check if an admin already exists
    const admins = await locals.pb.admins.getList(1, 1);
    if (admins.totalItems > 0) {
      throw error(400, 'An admin account already exists');
    }

    // Parse registration data
    const { email, password, passwordConfirm } = await request.json();

    // Validate input
    if (!email || !password || password !== passwordConfirm) {
      throw error(400, 'Invalid registration details');
    }

    // Create admin account
    const createdAdmin = await locals.pb.admins.create({
      email,
      password,
      passwordConfirm
    });

    // Automatically authenticate the new admin
    const authData = await locals.pb.admins.authWithPassword(email, password);

    return json({ 
      success: true, 
      message: 'Admin account created and logged in',
      admin: {
        id: createdAdmin.id,
        email: createdAdmin.email
      }
    });
  } catch (err) {
    console.error('Admin registration error:', err);
    
    // Provide more detailed error response
    throw error(400, {
      message: 'Registration failed',
      details: err instanceof Error ? err.message : 'Unknown error'
    });
  }
};
