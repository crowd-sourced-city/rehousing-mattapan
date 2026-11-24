import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke tests against the production build (`npm run build` first).
 * Run: npm run test:e2e
 * Against a deployed site instead: BASE_URL=https://…/pr-preview/pr-1/ npm run test:e2e
 */
const deployed = process.env.BASE_URL;
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: deployed ?? 'http://localhost:4173/', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec/ },
  ],
  webServer: deployed
    ? undefined
    : {
        command: 'npx vite preview --port 4173 --strictPort',
        url: 'http://localhost:4173/',
        reuseExistingServer: !process.env.CI,
      },
});
