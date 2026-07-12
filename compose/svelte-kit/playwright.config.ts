import { defineConfig } from '@playwright/test';

// Runs against the dev stack on localhost:5174 (docker compose --profile
// development-px4 up); the auth fixture mints a session in the dev database.
export default defineConfig({
	testDir: './e2e',
	timeout: 60_000,
	reporter: 'list',
	// One worker: every spec drives the same dev app and the same simulated
	// vehicle, and parallel load starves the lockstep SITL.
	workers: 1,
	fullyParallel: false,
	use: {
		baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5174',
		viewport: { width: 1567, height: 900 }
	}
});
