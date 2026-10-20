import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:7860',
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', testIgnore: '**/*server.spec.ts', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testIgnore: '**/*server.spec.ts', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'server', testMatch: '**/*server.spec.ts' },
  ],
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:7860/api/health',
    reuseExistingServer: !process.env.CI,
    env: { APP_DATA_DIR: resolve('.local', `playwright-accounts-${Date.now()}`) },
  },
});
