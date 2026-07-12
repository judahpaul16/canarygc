import { test as base } from '@playwright/test';
import { createClient } from '@libsql/client';
import { fileURLToPath } from 'node:url';

// Authenticates by minting a short-lived session for the existing operator
// straight into the dev database, the same table Lucia reads. Sessions are
// removed again when the run ends.
const DB_URL = `file:${process.env.E2E_DB_PATH ?? fileURLToPath(new URL('../src/data.db', import.meta.url))}`;
const SESSION_TTL_S = 3600;

// The dev server writes the same sqlite file, so writes retry through
// transient busy locks.
async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
	let lastError: unknown;
	for (let i = 0; i < attempts; i++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, 200 * (i + 1)));
		}
	}
	throw lastError;
}

export const test = base.extend({
	context: async ({ context, baseURL }, use) => {
		const db = createClient({ url: DB_URL });
		const user = await withRetry(() => db.execute('SELECT id FROM user LIMIT 1'));
		if (!user.rows.length) throw new Error('No operator account in the dev database; create one via first run.');
		const sessionId = `e2e${Math.random().toString(36).slice(2, 26)}`;
		await withRetry(() =>
			db.execute({
				sql: 'INSERT INTO session (id, user_id, expires_at) VALUES (?, ?, ?)',
				args: [sessionId, user.rows[0].id as string, Math.floor(Date.now() / 1000) + SESSION_TTL_S]
			})
		);
		await context.addCookies([
			{ name: 'auth_session', value: sessionId, url: baseURL ?? 'http://localhost:5174' }
		]);
		await use(context);
		await withRetry(() => db.execute({ sql: 'DELETE FROM session WHERE id = ?', args: [sessionId] }));
	}
});

export { expect } from '@playwright/test';

// A fresh context shows the offline banner until the first status poll
// confirms the link; it overlays the top of the page, so specs wait it out.
export async function waitForLink(page: import('@playwright/test').Page) {
	const { expect } = await import('@playwright/test');
	await expect(page.getByText('You are currently offline')).toHaveCount(0, { timeout: 30_000 });
}
