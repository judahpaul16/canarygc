import { expect, test, waitForLink } from './fixtures';

// Uploads a small plan to the live SITL and asserts the vehicle accepts it,
// exercising the MISSION_REQUEST_INT / MISSION_ITEM_INT / MISSION_ACK
// handshake end to end. Opt in with E2E_SITL=1 against a running simulator.
test.describe('mission upload against SITL', () => {
	test.skip(process.env.E2E_SITL !== '1', 'set E2E_SITL=1 with the SITL profile running');
	test.setTimeout(60_000);

	test('the vehicle accepts an uploaded plan', async ({ page }) => {
		await page.goto('/event-log');
		await page.locator('#mav-console-input').waitFor({ timeout: 30_000 });
		await waitForLink(page);

		// A takeoff followed by two waypoints; upload only stores the plan, so
		// the exact coordinates need only be valid.
		const items = [
			{ command: 22, frame: 3, lat: 33.792, lon: -84.371, alt: 15, param1: 0, param2: 0, param3: 0, param4: 0 },
			{ command: 16, frame: 3, lat: 33.7925, lon: -84.3715, alt: 20, param1: 0, param2: 0, param3: 0, param4: 0 },
			{ command: 16, frame: 3, lat: 33.793, lon: -84.3705, alt: 20, param1: 0, param2: 0, param3: 0, param4: 0 }
		];

		const res = await page.request.post('/api/mavlink/load_mission', {
			headers: { actions: JSON.stringify(items) }
		});
		const body = await res.text();
		expect(res.status(), body).toBe(200);
		expect(body).toContain('accepted');
	});
});
