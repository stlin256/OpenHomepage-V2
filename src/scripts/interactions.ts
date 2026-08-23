/**
 * 前端交互入口：首屏加载 + 客户端内容交换后初始化。
 *
 * 导航策略：拦截站内链接点击 → 显示加载遮罩 → fetch 目标页 →
 * 替换 <main> 内容 → 重新初始化动效/交互 → 移除遮罩。
 * URL 不变、header/audio/nav 不动 → BGM 连续播放、无转场动画。
 */
import { initStreamBlocks } from './stream-player.ts';
import { initMotion } from './motion.ts';
import { initThemeToggle } from './theme.ts';
import { initBgm } from './bgm.ts';
import { initHeatmapTooltips } from './heatmap.ts';
import './lightbox.ts';

// ---- 加载遮罩 ----

function ensureLoadingOverlay(): HTMLElement {
  let el = document.querySelector<HTMLElement>('.page-loading');
  if (!el) {
    el = document.createElement('div');
    el.className = 'page-loading';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="page-loading-spinner"></div>';
    document.body.append(el);
  }
  return el;
}

function showLoading(): void {
  ensureLoadingOverlay().classList.add('visible');
}

function hideLoading(): void {
  document.querySelector('.page-loading')?.classList.remove('visible');
}

// ---- 初始化 ----

function initNavToggle(): void {
  const btn = document.querySelector<HTMLElement>('.nav-toggle');
  if (!btn || btn.dataset.navInit) return;
  btn.dataset.navInit = '1';
  btn.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

function updateNavActive(path: string): void {
  const current = path.replace(/\/+$/, '') || '/';
  for (const a of document.querySelectorAll<HTMLAnchorElement>('.site-nav a')) {
    const href = (a.getAttribute('href') ?? '').replace(/\/+$/, '') || '/';
    const active = href === current;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function initAll(): void {
  initThemeToggle();
  initNavToggle();
  initStreamBlocks();
  initMotion();
  initBgm();
  initHeatmapTooltips();
}

// ---- 客户端内容交换 ----

let swapping = false;

async function swapContent(path: string): Promise<void> {
  if (swapping) return;
  swapping = true;
  showLoading();
  try {
    const r = await fetch(path);
    if (!r.ok) {
      hideLoading();
      location.href = path;
      return;
    }
    const html = await r.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newMain = doc.querySelector('main.site-main');
    const newFooter = doc.querySelector('footer.site-footer');
    const oldMain = document.querySelector('main.site-main');
    const oldFooter = document.querySelector('footer.site-footer');
    if (!newMain || !oldMain) {
      hideLoading();
      location.href = path;
      return;
    }
    // 淡出旧内容
    oldMain.style.opacity = '0';
    await new Promise((r2) => setTimeout(r2, 120));
    // 替换内容
    oldMain.replaceChildren(...newMain.children);
    if (newFooter && oldFooter) {
      oldFooter.replaceChildren(...newFooter.children);
    } else if (newFooter && !oldFooter) {
      oldMain.after(newFooter);
    } else if (!newFooter && oldFooter) {
      oldFooter.remove();
    }
    updateNavActive(path);
    document.body.classList.remove('nav-open');
    document.querySelector('.nav-toggle')?.setAttribute('aria-expanded', 'false');
    // 淡入新内容
    oldMain.style.opacity = '';
    // 重新初始化（动效、流式、灯箱等）
    initAll();
    window.scrollTo({ top: 0 });
  } catch {
    location.href = path;
  } finally {
    hideLoading();
    swapping = false;
  }
}

function isInternalLink(href: string): boolean {
  if (!href.startsWith('/') || href.startsWith('//')) return false;
  return true;
}

// ---- 导航拦截 ----

document.addEventListener('click', (e) => {
  const link = e.target instanceof Element ? e.target.closest('a') : null;
  if (!link) return;
  const href = link.getAttribute('href') ?? '';
  // 语言切换器走整页导航（需更新 <html lang>、head 等）
  if (link.closest('.lang-switcher')) return;
  // 外链 / 锚点不动
  if (!isInternalLink(href) || href.includes('#')) return;
  // 修饰键点击不动
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  void swapContent(href);
});

// ---- 语言切换器菜单 ----

function setLangMenu(menu: Element, open: boolean): void {
  menu.classList.toggle('open', open);
  menu
    .closest('.lang-switcher')
    ?.querySelector('.lang-toggle')
    ?.setAttribute('aria-expanded', open ? 'true' : 'false');
}
document.addEventListener('click', (e) => {
  const toggle = e.target instanceof Element ? e.target.closest('.lang-toggle') : null;
  const ownMenu = toggle?.closest('.lang-switcher')?.querySelector('.lang-menu');
  for (const menu of document.querySelectorAll('.lang-menu.open')) {
    if (menu !== ownMenu) setLangMenu(menu, false);
  }
  if (ownMenu) setLangMenu(ownMenu, !ownMenu.classList.contains('open'));
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  for (const menu of document.querySelectorAll('.lang-menu.open')) setLangMenu(menu, false);
});

// ---- RSS 封面加载失败 ----

document.addEventListener(
  'error',
  (e) => {
    if (e.target instanceof HTMLImageElement) {
      const cover = e.target.closest<HTMLElement>('.rss-cover');
      if (cover) cover.style.display = 'none';
    }
  },
  true
);

// 首屏初始化
initAll();
