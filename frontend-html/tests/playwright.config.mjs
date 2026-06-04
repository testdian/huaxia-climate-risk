import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'e2e-full.spec.mjs',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:8765',
    headless: true,
    locale: 'zh-CN',
  },
  reporter: [['list']],
});
