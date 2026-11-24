import { expect, type Page } from '@playwright/test';

/**
 * Collect app errors so a test can fail on them. Errors from the Google Street View
 * iframe are third-party noise and are ignored: matched by message *and* by source URL,
 * since resource errors ("Failed to load resource…") only name the URL in their location.
 */
const THIRD_PARTY = /google|gstatic|ggpht|accelerometer|Permissions policy/i;
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (THIRD_PARTY.test(m.text()) || THIRD_PARTY.test(m.location().url ?? '')) return;
    errors.push(`${m.text()} @ ${m.location().url}`);
  });
  return errors;
}

/** Search for an address and pick the first suggestion. */
export async function pickAddress(page: Page, address: string) {
  await page.goto('#/find');
  const input = page.getByRole('combobox').or(page.locator('input').first()).first();
  await expect(input).not.toHaveAttribute('placeholder', /Loading/, { timeout: 30_000 });
  await input.fill(address);
  await page.getByRole('option').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(address);
}

/** Answer the first choice of every radio group on the page. */
export async function answerAll(page: Page) {
  const names = await page.$$eval('input[type=radio]', (els) => [...new Set(els.map((e) => (e as HTMLInputElement).name))]);
  for (const n of names) await page.locator(`input[name="${n}"]`).first().check();
}
