/**
 * 亮/暗主题切换（两态）：
 * - 打开页面：sessionStorage 用户选择 > site.yaml default_mode > 跟随系统
 *   （首帧由 BaseLayout 内联脚本在绘制前完成同样的解析，防闪烁）；
 * - 手动切换：写 sessionStorage，本次会话内保持；
 * - 客户端内容交换不触碰 <html>，主题属性天然持久，无需 swap 监听。
 *
 * 纯逻辑（initialTheme/toggleTheme）在 src/lib/theme.ts，可单测；这里只做 DOM/存储。
 */
import { initialTheme, toggleTheme, type ThemeName, type ThemeModeSetting } from '../lib/theme.ts';

const STORAGE_KEY = 'theme';

function readSaved(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function systemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function siteDefaultMode(): ThemeModeSetting {
  const m = document.documentElement.dataset.defaultMode;
  return m === 'light' || m === 'dark' ? m : 'system';
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
}

let themeTransitionTimer: number | undefined;

/** 主题变化期间临时启用全站颜色过渡，结束后移除，避免常驻全局 transition。 */
export function applyThemeWithTransition(theme: ThemeName): void {
  const root = document.documentElement;
  window.clearTimeout(themeTransitionTimer);
  root.classList.add('theme-switching');
  applyTheme(theme);
  themeTransitionTimer = window.setTimeout(() => {
    root.classList.remove('theme-switching');
  }, 220);
}

export function currentTheme(): ThemeName {
  return initialTheme(readSaved(), siteDefaultMode(), systemDark());
}

export function initThemeToggle(): void {
  const btn = document.querySelector<HTMLElement>('.theme-toggle');
  if (!btn || btn.dataset.themeInit) return;
  btn.dataset.themeInit = '1';
  btn.addEventListener('click', () => {
    const next = toggleTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    try {
      sessionStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 存储不可用时仍当页生效 */
    }
    applyThemeWithTransition(next);
  });
}

// 系统主题变化：只在用户未手动选择时跟随
const media = window.matchMedia('(prefers-color-scheme: dark)');
if (media.addEventListener) {
  media.addEventListener('change', () => {
    if (readSaved() === null) applyThemeWithTransition(currentTheme());
  });
}
