import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

test('advocacy page: maps, rule-change toggles, lot details and charts', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('advocacy/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('room for more homes');
  // four small maps + the explore map
  await expect(page.locator('.lotmap canvas')).toHaveCount(5, { timeout: 30_000 });

  const counter = page.locator('.counter .big');
  const before = await counter.innerText();
  await page.getByRole('checkbox', { name: /Let existing homes keep their setbacks/ }).check();
  await expect(counter).not.toHaveText(before);
  await expect(counter.locator('.delta')).toContainText('+');

  const map = page.locator('.explore-map .lotmap');
  await map.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800); // let the map settle after scrolling
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.45);
  await expect(page.locator('.lot-card')).toBeVisible();

  for (const tab of ['Room to grow', 'Why not?']) await page.getByRole('tab', { name: tab }).click();
  await expect(page.locator('figure.chart')).toHaveCount(3);
  expect(errors).toEqual([]);
});
