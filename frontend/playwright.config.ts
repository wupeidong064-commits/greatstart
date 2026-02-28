import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // 限制为单线程运行，避免 429 错误

  // 全局超时设置
  timeout: 120000, // 每个测试最大 2 分钟
  expect: {
    timeout: 10000, // expect 断言超时 10 秒
  },

  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off', // 禁用视频以避免 ffmpeg 依赖
    actionTimeout: 15000, // 每个操作超时 15 秒
    navigationTimeout: 30000, // 导航超时 30 秒
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
