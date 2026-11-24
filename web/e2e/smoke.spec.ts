import { expect, test } from '@playwright/test';
import { answerAll, pickAddress, watchErrors } from './helpers';

test('landing page loads and links to the property search', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('');
  await expect(page.getByText('BOSTON ADU EXPLORER')).toBeVisible();
  await page.getByRole('link', { name: /find your property/i }).first().click();
  await expect(page).toHaveURL(/#\/find/);
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('full flow: find → details → options → questions → result', async ({ page }) => {
  const errors = watchErrors(page);
  await pickAddress(page, '46 Astoria St'); // medium R2 lot that passes the site check
  await page.locator('.btn.primary').first().click();
  await expect(page).toHaveURL(/#\/details/);

  await answerAll(page);
  await page.locator('.btn.primary').last().click();
  await expect(page).toHaveURL(/#\/options/);
  await expect(page.getByRole('heading', { name: 'Extend Towards the Backyard' })).toBeVisible();
  // Non-corner lot: the corner option is not offered at all.
  await expect(page.getByText('Attach on a Corner Lot')).toHaveCount(0);

  await page.goto('#/option/rear-medium');
  await page.locator('.btn.primary').first().click();
  await expect(page).toHaveURL(/questions/);
  await answerAll(page);
  await page.locator('.btn.primary').last().click();
  await expect(page).toHaveURL(/result/);
  await expect(page.locator('.badge').first()).toHaveText(/Looks possible|More information needed|Closer look needed|Not supported/);
  await expect(page.getByRole('heading', { name: /why did i get this result/i })).toBeVisible();
  await expect(page.locator('.plan svg').first()).toBeVisible();

  await page.getByRole('button', { name: /how we reached this result/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(errors).toEqual([]);
});

test('every option for a large lot with a garage gives a result', async ({ page }) => {
  const errors = watchErrors(page);
  await pickAddress(page, '507 Norfolk St');
  for (const id of ['rear-medium', 'side', 'corner', 'garage', 'backyard', 'front']) {
    await page.goto(`#/option/${id}/result`);
    await expect(page.locator('.badge').first(), id).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('lot that fails the Article 60 site check → "not possible" screen', async ({ page }) => {
  await pickAddress(page, '28 Astoria St');
  await page.goto('#/options');
  await expect(page).toHaveURL(/#\/not-possible/);
});

test('irregular lot → "tool can’t check this lot yet" screen', async ({ page }) => {
  await pickAddress(page, '749 Morton St');
  await page.locator('.btn.primary').first().click();
  await expect(page).toHaveURL(/#\/unsupported/);
});

test('static pages render', async ({ page }) => {
  const errors = watchErrors(page);
  for (const route of ['paying', 'rules', 'have-a-say']) {
    await page.goto(`#/${route}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('dropdowns open and close', async ({ page }) => {
  await page.goto('#/rules');
  const d = page.locator('details.exp').first();
  await d.locator('summary').click();
  await expect(d).toHaveAttribute('open', '');
  await d.locator('summary').click();
  await expect(d).not.toHaveAttribute('open', '');
});
