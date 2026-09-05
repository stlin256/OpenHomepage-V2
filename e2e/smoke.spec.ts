// 最小冒烟集：验证构建产物的核心骨架（首页 / 语言切换 / 搜索 / 内容页导航）。
// 断言刻意保持宽松（不绑定具体文案），使 data.example 与真实数据下均可运行。
import { test, expect } from '@playwright/test';

test('首页加载：标题非空、头部与导航可见', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/.+/);
  // .site-header 无专属样式、几何高度为 0，只能断言挂载；可见性断言落在有实际尺寸的子元素上
  await expect(page.locator('.site-header')).toBeAttached();
  await expect(page.locator('.site-nav')).toBeVisible();
  await expect(page.locator('.search-toggle')).toBeVisible();
});

test('语言切换：从默认语言进入英文版', async ({ page }) => {
  await page.goto('/');
  await page.locator('.lang-switcher').hover();
  await page.locator('.lang-menu a[hreflang="en"]').click();
  await expect(page).toHaveURL(/\/en(\/|$)/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('搜索模态框：打开后输入关键词，状态栏有响应', async ({ page }) => {
  await page.goto('/');
  await page.locator('.search-toggle').click();
  const dialog = page.locator('.search-dialog');
  await expect(dialog).toBeVisible();
  const status = page.locator('.search-status');
  const initial = (await status.textContent()) ?? '';
  await page.locator('.search-input').fill('a');
  // 有结果或无结果都会改写状态栏文案，只要不再停留在初始提示即视为搜索链路通畅
  await expect(status).not.toHaveText(initial);
});

test('内容页：经导航进入关于页，正文标题可见', async ({ page }) => {
  await page.goto('/');
  await page.locator('.site-nav a[href$="/about"], .site-nav a[href$="/about/"]').first().click();
  await expect(page).toHaveURL(/\/about\/?$/);
  await expect(page.locator('h1').first()).toBeVisible();
});
