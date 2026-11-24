import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Build stamp for the error screen's Developer Info (CI passes the commit as BUILD_SHA).
function commit() {
  const sha = process.env.BUILD_SHA || process.env.GITHUB_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + ' (local)';
  } catch {
    return 'local';
  }
}
const BUILD_COMMIT = commit();
const BUILD_TIME = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/** Inlines src/boot.js (the pre-start error safety net) at the top of each page's <head>. */
function bootScript(): Plugin {
  return {
    name: 'boot-script',
    transformIndexHtml() {
      const js = readFileSync(resolve(__dirname, 'src/boot.js'), 'utf8').replace('__BUILD__', JSON.stringify(`${BUILD_COMMIT} · built ${BUILD_TIME}`));
      return [{ tag: 'script', children: js, injectTo: 'head-prepend' }];
    },
  };
}

// base './' so the build works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [react(), bootScript()],
  define: { __BUILD_COMMIT__: JSON.stringify(BUILD_COMMIT), __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
});
