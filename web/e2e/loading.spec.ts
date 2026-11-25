import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

/** Page loading and failure handling: no page should ever be left blank. */

// The map's code file(s); the bundler may name the map library's chunk either way.
const MAP_CODE = /maplibre|ParcelMap/i;

test('pages without a map do not download the map library', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  for (const route of ['', '#/rules', '#/paying', '#/have-a-say']) {
    await page.goto(route);
    await expect(page.locator('main, .page, h1').first()).toBeVisible();
  }
  await page.waitForLoadState('networkidle');
  expect(requested.filter((u) => MAP_CODE.test(u))).toEqual([]);

  await page.goto('#/find');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  expect(requested.some((u) => MAP_CODE.test(u))).toBe(true);
});

test('a page whose code fails to download shows the error screen with developer info', async ({ page }) => {
  await page.route(/\/assets\/Rules-[^/]*\.js$/, (r) => r.abort());
  await page.goto('#/rules');
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
  await expect(page.getByText(/didn’t download/)).toBeVisible();
  await page.getByText('Developer Info').click();
  const info = page.locator('.dev-info pre');
  await expect(info).toContainText('Page:');
  await expect(info).toContainText('#/rules');
  await expect(info).toContainText('Build:');
  await expect(page.getByRole('button', { name: 'Reload page' })).toBeVisible();

  // Once the network is back, reloading recovers.
  await page.unroute(/\/assets\/Rules-[^/]*\.js$/);
  await page.getByRole('button', { name: 'Reload page' }).click();
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
});

test('if the app itself fails to load, the pre-start safety net shows the error screen', async ({ page }) => {
  await page.route(/\/assets\/(tool|index)-[^/]*\.js$/, (r) => r.abort());
  await page.goto('');
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
  await page.getByText('Developer Info').click();
  await expect(page.locator('.dev-info pre')).toContainText(/Failed to load .*(tool|index)-/);
});

test('a slow app download shows a loading message, not a blank page', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(/\/assets\/(tool|index)-[^/]*\.js$/, async (r) => {
    await gate;
    await r.continue();
  });
  const errors = watchErrors(page);
  await page.goto('', { waitUntil: 'commit' });
  await expect(page.getByText('Loading Boston ADU Explorer…')).toBeVisible();
  release();
  await expect(page.getByText('BOSTON ADU EXPLORER')).toBeVisible();
  expect(errors).toEqual([]);
});

test('moving between pages works when scroll methods return a Promise (Chrome 157+)', async ({ page }) => {
  // Newer Chrome returns a Promise from window.scrollTo. Simulate that in any browser,
  // since the pinned test Chromium is older.
  await page.addInitScript(() => {
    const original = window.scrollTo.bind(window);
    window.scrollTo = ((...args: Parameters<typeof window.scrollTo>) => {
      original(...args);
      return Promise.resolve();
    }) as typeof window.scrollTo;
  });
  const errors = watchErrors(page);
  await page.goto('#/rules');
  for (const route of ['#/have-a-say', '#/paying', '#/find', '#/rules', '#/']) {
    await page.evaluate((h) => (location.hash = h), route);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
