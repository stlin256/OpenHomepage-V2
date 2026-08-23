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
    // 同步 header 中的导航和语言菜单到新语言（header 不整体替换，保留按钮监听）
    const newNav = doc.querySelector('nav.site-nav');
    const oldNav = document.querySelector('nav.site-nav');
    if (newNav && oldNav) {
      const newTitle = newNav.querySelector('.site-title a');
      const oldTitle = oldNav.querySelector('.site-title a');
      if (newTitle && oldTitle) oldTitle.textContent = newTitle.textContent;
      const newList = newNav.querySelector('ul');
      const oldList = oldNav.querySelector('ul');
      if (newList && oldList) oldList.replaceChildren(...newList.children);
    }
    const newLangMenu = doc.querySelector('.lang-menu');
    const oldLangMenu = document.querySelector('.lang-menu');
    if (newLangMenu && oldLangMenu) {
      const newLinks = newLangMenu.querySelectorAll('a');
      const oldLinks = oldLangMenu.querySelectorAll('a');
      for (let i = 0; i < Math.min(newLinks.length, oldLinks.length); i++) {
        oldLinks[i].className = newLinks[i].className;
      }
    }
    // 更新 html lang 属性（从新页面的 <html> 提取）
    const newLang = doc.documentElement.getAttribute('lang');
    if (newLang) document.documentElement.setAttribute('lang', newLang);
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
  // 语言切换器也走内容交换（保留当前页面）
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
