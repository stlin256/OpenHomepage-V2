// 最小 e2e 冒烟集：Playwright 直出已构建的 dist/（astro preview）。
// 运行前需先构建：`tsx scripts/generate-fonts.ts && npx astro build`（或完整 `npm run build`）。
// 注意 base：本配置假定根 base；CI e2e-smoke job 用 ASTRO_BASE='/' 构建保持一致。
import { defineConfig, devices } from '@playwright/test';

// 必须先于浏览器启动：浏览器二进制定位到 node_modules 内（同 scripts/screenshots.ts 约定）
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '0';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html']] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    // 钉住浏览器语言，避免首访语言探测把 / 重定向到 /en/ 造成用例不确定性
    locale: 'zh-CN',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview -- --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
