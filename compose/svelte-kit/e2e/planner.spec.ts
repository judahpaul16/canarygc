import { expect, test, waitForLink } from './fixtures';

test.describe('mission planner window', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/mission-planner');
		// The window chrome mounts once the map registers the page's window
		// rect; a fixed sleep races the dev server's module waterfall.
		await page.locator('.map-btn[aria-label="Toggle fullscreen"]').waitFor({ timeout: 30_000 });
		await waitForLink(page);
		await page.waitForTimeout(800);
	});

	test('map controls receive clicks and toggle', async ({ page }) => {
		for (const label of [
			'Toggle fullscreen',
			'Toggle map lock',
			'Toggle airspace overlay',
			'Toggle LAANC ceiling grid',
			'Toggle obstacles',
			'Toggle live air traffic'
		]) {
			const hitsSelf = await page.evaluate((l) => {
				const btn = document.querySelector(`.map-btn[aria-label="${l}"]`);
				if (!btn) return false;
				const r = btn.getBoundingClientRect();
				const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
				return hit === btn || btn.contains(hit);
			}, label);
			expect(hitsSelf, `${label} is clickable`).toBe(true);
		}
		const lock = page.locator('.map-btn[aria-label="Toggle map lock"]');
		const before = await lock.locator('i').getAttribute('class');
		await lock.click();
		await expect
			.poll(async () => lock.locator('i').getAttribute('class'), { timeout: 10_000 })
			.not.toBe(before);
		await lock.click();
	});

	test('double-click seeds a takeoff and adds a waypoint', async ({ page }) => {
		const before = await page.evaluate(
			() => document.querySelectorAll('.leaflet-marker-pane img').length
		);
		const frame = await page.evaluate(() => {
			const r = document.querySelector('.window-frame')!.getBoundingClientRect();
			return { x: r.left + r.width * 0.35, y: r.top + r.height * 0.6 };
		});
		await page.mouse.dblclick(frame.x, frame.y);
		await expect
			.poll(
				async () =>
					page.evaluate(() => document.querySelectorAll('.leaflet-marker-pane img').length),
				{ timeout: 10_000 }
			)
			.toBeGreaterThan(before + 1);
	});

	test('map type toggle cycles Satellite, 3D Buildings, and Streets', async ({ page }) => {
		const readLabel = () =>
			page.evaluate(() => document.querySelector('#map-toggle span span')?.textContent);
		const seen = new Set<string>([(await readLabel()) ?? '']);
		for (let i = 0; i < 3; i++) {
			await page.click('#map-toggle');
			await page.waitForTimeout(800);
			seen.add((await readLabel()) ?? '');
		}
		expect([...seen].sort()).toEqual(['3D Buildings', 'Satellite', 'Streets']);
	});

	test('survey pattern generates serpentine waypoints from clicked corners', async ({ page }) => {
		const before = await page.evaluate(
			() => document.querySelectorAll('.leaflet-marker-pane img').length
		);
		await page.click('button:has-text("Survey Pattern")');
		await page.waitForTimeout(500);
		const frame = await page.evaluate(() => {
			const r = document.querySelector('.window-frame')!.getBoundingClientRect();
			return { left: r.left, top: r.top, w: r.width, h: r.height };
		});
		for (const [fx, fy] of [
			[0.3, 0.35],
			[0.6, 0.35],
			[0.6, 0.65],
			[0.3, 0.65]
		]) {
			await page.mouse.click(frame.left + frame.w * fx, frame.top + frame.h * fy);
			await page.waitForTimeout(450);
		}
		await page.mouse.dblclick(frame.left + frame.w * 0.45, frame.top + frame.h * 0.5);
		await page.locator('input[placeholder*="Transect" i]').fill('40');
		await page.locator('input[placeholder*="Grid angle" i]').fill('90');
		await page.locator('input[placeholder*="Altitude" i]').fill('35');
		await page.click('button:has-text("Generate")');
		await expect
			.poll(
				async () =>
					page.evaluate(() => document.querySelectorAll('.leaflet-marker-pane img').length),
				{ timeout: 10_000 }
			)
			.toBeGreaterThan(before + 3);
	});

	test('overlay toggles persist across a reload', async ({ page }) => {
		const airspace = page.locator('.map-btn[aria-label="Toggle airspace overlay"] i');
		const wasOn = (await airspace.getAttribute('class'))?.includes('text-') ?? false;
		await airspace.click();
		await page.waitForTimeout(400);
		await page.reload();
		await page.locator('.map-btn[aria-label="Toggle airspace overlay"]').waitFor({ timeout: 30_000 });
		const isOn = (await airspace.getAttribute('class'))?.includes('text-') ?? false;
		expect(isOn).toBe(!wasOn);
		await airspace.click();
	});
});
