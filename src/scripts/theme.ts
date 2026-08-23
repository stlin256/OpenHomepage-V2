/**
 * 亮/暗主题切换（两态，docs/specs/10 §3）：
 * - 打开页面：sessionStorage 用户选择 > site.yaml theme.default_mode > 跟随系统
 *   （首帧由 BaseLayout 内联脚本在绘制前完成同样的解析，防闪烁）；
 * - 手动切换：写 sessionStorage，本次会话内（含站内转场导航）保持；
 *   离开站点/关闭标签页后重置，重新跟随系统；
 * - ClientRouter 转场：swap 会把 <html> 属性还原为 SSR 值（默认亮色）且内联脚本
 *   不重放（swap-functions deselectScripts）。astro:before-swap 先把旧 <html> 的
 *   data-theme / 内联 accent style / .js 标记复制进新文档（carryThemeAttrs），
 *   保证 swap 完成瞬间主题已正确；astro:after-swap 再重放一次作兜底（#4）。
 *
 * 纯逻辑（initialTheme/toggleTheme）在 src/lib/theme.ts，可单测；这里只做 DOM/存储。
 */
import {
  carryThemeAttrs,
  initialTheme,
  toggleTheme,
  type ThemeName,
  type ThemeModeSetting,
} from '../lib/theme.ts';

const STORAGE_KEY = 'theme';

function readSaved(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // 隐私模式等存储不可用场景：视为未选择
  }
}

function systemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** SSR 注入的站点默认模式（BaseLayout <html data-default-mode>） */
function siteDefaultMode(): ThemeModeSetting {
  const m = document.documentElement.dataset.defaultMode;
  return m === 'light' || m === 'dark' ? m : 'system';
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
}

/** 当前应生效的主题：用户选择 > 站点默认 > 跟随系统 */
export function currentTheme(): ThemeName {
  return initialTheme(readSaved(), siteDefaultMode(), systemDark());
}

/** 绑定切换按钮（astro:page-load 驱动；转场后按钮 DOM 重建，需重新绑定） */
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
    applyTheme(next);
  });
}

// 模块脚本在转场间常驻：
// - before-swap：把旧 <html> 的 data-theme / 内联 accent style / .js 标记搬进新文档，
//   swap 完成瞬间主题即正确（否则新文档 SSR 默认亮色，暗色下先闪一帧白）；
// - after-swap：立即重放主题，作兜底（如 before-swap 未覆盖的场景）。
document.addEventListener('astro:before-swap', (e) => {
  const newDoc = (e as Event & { newDocument?: Document }).newDocument;
  if (newDoc) carryThemeAttrs(document.documentElement, newDoc.documentElement);
});
document.addEventListener('astro:after-swap', () => applyTheme(currentTheme()));

// 系统主题变化：只在用户未手动选择时跟随
const media = window.matchMedia('(prefers-color-scheme: dark)');
if (media.addEventListener) {
  media.addEventListener('change', () => {
    if (readSaved() === null) applyTheme(currentTheme());
  });
}
