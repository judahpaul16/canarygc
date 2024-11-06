// src/routes/login/+server.js
/**
 * Creates a `POST /login` server-side endpoint
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, locals }) {
    const { email, password } = await request.json();

    const { token, record } = await locals.pb.collection('users').authWithPassword(email, password);

    return new Response('Success...');
}