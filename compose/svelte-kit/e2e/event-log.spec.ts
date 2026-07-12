import { expect, test, waitForLink } from './fixtures';

test.describe('event log', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/event-log');
		await page.locator('#mav-console-input').waitFor({ timeout: 30_000 });
		await waitForLink(page);
		await page.waitForTimeout(1000);
	});

	test('header, log view, and console all hold their space', async ({ page }) => {
		const layout = await page.evaluate(() => {
			const h = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().height ?? 0;
			return {
				head: h('.log-head'),
				logView: h('.log-view'),
				console: h('.console'),
				logScrolls: getComputedStyle(document.querySelector('.log-view')!).overflowY
			};
		});
		expect(layout.head).toBeGreaterThan(20);
		expect(layout.console).toBeGreaterThan(40);
		expect(layout.logView).toBeGreaterThan(100);
		expect(layout.logScrolls).toBe('auto');
	});

	test('console autocompletes and validates commands', async ({ page }) => {
		await page.fill('#mav-console-input', 'NAV_TAKE');
		await expect(page.locator('.console-suggestions button').first()).toContainText('NAV_TAKEOFF');
		await page.fill('#mav-console-input', 'NAV_TAKEOFF banana');
		await page.press('#mav-console-input', 'Enter');
		await expect(page.locator('.console-hint')).toContainText('banana');
	});
});
