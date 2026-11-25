import { expect, test, type Page } from '@playwright/test';
import { answerAll, pickAddress, watchErrors } from './helpers';

/**
 * Usability telemetry. Tests run in debug mode, which records events in the page
 * (window.__aduEvents) instead of sending them: test builds have no PostHog key,
 * and telemetry never sends from automated browsers.
 */
type Ev = { event: string } & Record<string, unknown>;
const events = (page: Page) => page.evaluate(() => ((window as unknown as { __aduEvents?: Ev[] }).__aduEvents ?? []) as Ev[]);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('adu-telemetry-debug', '1'));
});

test('the homeowner flow sends step events, and never an address or lot ID', async ({ page }) => {
  const errors = watchErrors(page);
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));

  await page.goto('#/find');
  await page.getByRole('combobox').or(page.locator('input').first()).first().fill('zzzz no such street');
  await expect(page.getByText('No Mattapan address matches')).toBeVisible();
  await expect.poll(async () => (await events(page)).some((e) => e.event === 'search_no_results')).toBe(true);

  await pickAddress(page, '46 Astoria St');
  const lotId = await page.evaluate(() => JSON.parse(sessionStorage.getItem('adu-explorer-session-v1') ?? '{}').parcelId as string);
  await page.locator('.btn.primary').first().click();
  await answerAll(page);
  await page.locator('.btn.primary').last().click();
  await expect(page).toHaveURL(/#\/options/);
  await page.getByText(/how we checked/i).first().click();

  await page.goto('#/option/rear-medium');
  await page.locator('.btn.primary').first().click();
  await answerAll(page);
  await page.locator('.btn.primary').last().click();
  await expect(page).toHaveURL(/result/);
  await page.getByRole('button', { name: /how we reached this result/i }).click();
  await page.keyboard.press('Escape');
  await page.goBack();
  await expect(page).toHaveURL(/questions/);

  const ev = await events(page);
  const names = ev.map((e) => e.event);
  for (const name of [
    '$pageview',
    'search_no_results',
    'lot_selected',
    'find_continued',
    'details_completed',
    'options_viewed',
    'explainer_toggled',
    'option_questions_completed',
    'option_result',
    'result_explained',
    'navigated_back',
  ])
    expect(names, name).toContain(name);

  expect(ev.find((e) => e.event === 'lot_selected')).toMatchObject({ via: 'search', lot_size: 'medium', supported: true });
  expect(ev.find((e) => e.event === 'option_result')).toMatchObject({ option: 'rear-medium' });
  expect(ev.find((e) => e.event === 'navigated_back')).toMatchObject({ from: '/option/rear-medium/result', to: '/option/rear-medium/questions' });
  expect(ev.filter((e) => e.event === '$pageview').map((e) => e.route)).toContain('/options');

  // Privacy: nothing identifying in any event.
  const all = JSON.stringify(ev);
  expect(all).not.toContain('Astoria');
  expect(all).not.toContain(lotId);
  expect(all).not.toContain('zzzz');

  // No PostHog key in test builds, so the PostHog library is never even downloaded.
  expect(requested.filter((u) => /posthog/i.test(u))).toEqual([]);
  expect(errors).toEqual([]);
});

test('addresses on screen carry the class that blanks them in session replays', async ({ page }) => {
  await pickAddress(page, '46 Astoria St');
  // Every visible occurrence of the street name sits inside a masked element.
  const unmasked = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const bad: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode())
      if (/Astoria/.test(n.textContent ?? '') && !n.parentElement?.closest('.ph-private')) bad.push(n.parentElement?.outerHTML.slice(0, 120) ?? '');
    return bad;
  });
  expect(unmasked).toEqual([]);
});

test('the error screen reports what went wrong', async ({ page }) => {
  await page.route(/\/assets\/Rules-[^/]*\.js$/, (r) => r.abort());
  await page.goto('#/rules');
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
  const ev = await events(page);
  expect(ev.find((e) => e.event === 'error_shown')).toMatchObject({ load_error: true });
});
