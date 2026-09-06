import { defineConfig } from '@playwright/test';

/**
 * E2E（M3）：复用系统 Chrome（channel: 'chrome'，免下载浏览器内核）。
 * dev server 已在运行时直接复用（reuseExistingServer）。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 20_000,
  use: {
    channel: 'chrome',
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
  },
  webServer: [
    {
      command: 'pnpm --filter @takumagako/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 15_000,
    },
    {
      command: 'pnpm --filter @takumagako/signaling start',
      url: 'http://localhost:8787/health',
      reuseExistingServer: true,
      timeout: 15_000,
    },
  ],
});
