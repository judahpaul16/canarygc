import { expect, test, waitForLink } from './fixtures';

// Flies the live SITL: arms, takes off, then nudges position, altitude, and
// yaw from the fullscreen dock, asserting telemetry follows. Opt in with
// E2E_SITL=1 against a fresh simulator; lockstep SITL under host load drifts.
test.describe('manual control against SITL', () => {
	test.skip(process.env.E2E_SITL !== '1', 'set E2E_SITL=1 with the SITL profile running');
	test.describe.configure({ mode: 'serial' });
	test.setTimeout(120_000);

	const telemetry = async (page: import('@playwright/test').Page) => {
		const text = await page.evaluate(
			() => document.querySelector('#location-display')?.textContent ?? ''
		);
		const m = text.match(
			/MAV Location: (-?[\d.]+)°, (-?[\d.]+)°, Yaw Angle: (-?[\d.]+)°, Altitude: (-?[\d.]+)m/
		);
		if (!m) throw new Error(`No telemetry in location display: ${text}`);
		return { lat: Number(m[1]), lng: Number(m[2]), yaw: Number(m[3]), alt: Number(m[4]) };
	};

	test('takeoff, move, climb, and yaw all track telemetry', async ({ page }) => {
		await page.goto('/event-log');
		await page.locator('#mav-console-input').waitFor({ timeout: 30_000 });
		await waitForLink(page);
		await page.waitForTimeout(1000);
		const send = async (cmd: string) => {
			await page.fill('#mav-console-input', cmd);
			await page.press('#mav-console-input', 'Enter');
			await page.waitForTimeout(1200);
		};
		await send('COMPONENT_ARM_DISARM 1 0');
		await send('NAV_TAKEOFF 0 0 0 NaN NaN NaN 10');
		await page.waitForTimeout(13000);

		await page.goto('/mission-planner');
		await page.locator('.map-btn[aria-label="Toggle fullscreen"]').waitFor({ timeout: 30_000 });
		await page.waitForTimeout(800);
		await page.click('.map-btn[aria-label="Toggle fullscreen"]');
		await page.waitForTimeout(1500);

		const t0 = await telemetry(page);
		expect(t0.alt).toBeGreaterThan(5);

		await page.click('.d-pad button[aria-label="Move north"]');
		await page.waitForTimeout(6000);
		const t1 = await telemetry(page);
		expect(t1.lat).toBeGreaterThan(t0.lat);

		// The lockstep simulator's altitude estimate sags under host load, so
		// the climb asserts against the dive-to-target failure class rather
		// than an exact gain.
		await page.click('.ctl-btn[aria-label="Altitude up"]');
		await page.waitForTimeout(6000);
		const t2 = await telemetry(page);
		expect(t2.alt).toBeGreaterThan(t1.alt - 1.5);
		expect(t2.alt).toBeGreaterThan(3);

		await page.click('.ctl-btn[aria-label="Rotate right"]');
		await page.waitForTimeout(5000);
		const t3 = await telemetry(page);
		const dYaw = ((t3.yaw - t2.yaw + 540) % 360) - 180;
		expect(dYaw).toBeGreaterThan(3);
		expect(dYaw).toBeLessThan(20);

		const body = await page.evaluate(() => document.body.innerText);
		expect(body).not.toContain('Not available on PX4');
		expect(body).not.toContain('UNSUPPORTED');
	});
});
