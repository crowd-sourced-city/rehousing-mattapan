import { expect, test } from '@playwright/test';

test('phone width: no horizontal scrolling on key pages', async ({ page }) => {
  for (const route of ['', '#/find', '#/rules', '#/paying', 'advocacy/']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, route || 'landing').toBeLessThanOrEqual(1);
  }
});
