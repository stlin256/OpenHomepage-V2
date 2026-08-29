/**
 * 前端交互入口：首屏加载 + 客户端内容交换后初始化。
 *
 * 导航策略：拦截站内链接点击 → 显示加载遮罩 → fetch 目标页 →
 * 替换 <main> 内容 → 遮罩结束后再初始化动效/交互。
 * URL 同步更新、header/audio/nav 不动 → BGM 连续播放、刷新/前进后退状态一致。
 */
import { initStreamBlocks } from './stream-player.ts';
import { initMotion } from './motion.ts';
import { initThemeToggle } from './theme.ts';
import { initBgm } from './bgm.ts';
import { initHeatmapTooltips } from './heatmap.ts';
import { scheduleTabPrefetch } from './tab-prefetch.ts';
import { fetchPageHtml } from './page-cache.ts';
import { localizedPathname, normalizeSiteLanguage, type SiteLanguage } from '../lib/language.ts';
import './lightbox.ts';

const LANGUAGE_STORAGE_KEY = 'oh-language';

/** 站点实际语言列表（构建期由 <html data-site-langs> 注入；语言目录扫描结果，支持任意语言） */
function siteLanguages(): string[] {
  return (document.documentElement.dataset.siteLangs ?? '').split(',').filter(Boolean);
}

const normalizeLanguage = (value: string | null | undefined): SiteLanguage | null =>
  normalizeSiteLanguage(value, siteLanguages());

function readPreferredLanguage(): SiteLanguage | null {
  try {
    return normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writePreferredLanguage(lang: SiteLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    /* 存储不可用时仅保持当前页面状态 */
  }
}

function browserLanguage(): SiteLanguage | null {
  return normalizeLanguage(navigator.language);
}

function currentRouteLanguage(): SiteLanguage | null {
  return normalizeLanguage(document.documentElement.dataset.routeLang ?? document.documentElement.lang);
}

function languagePath(lang: SiteLanguage): string {
  const defaultLang = normalizeLanguage(document.documentElement.dataset.defaultLang) ?? siteLanguages()[0] ?? 'zh';
  return (
    localizedPathname(lang, location.pathname, currentRouteLanguage(), defaultLang) +
    location.search +
    location.hash
  );
}

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

/** 等待两帧（淡出起始帧 + 一帧过渡）；无 rAF 环境退化为短延时。 */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    } else {
      setTimeout(resolve, 32);
    }
  });
}

// ---- 初始化 ----

function initNavToggle(): void {
  const btn = document.querySelector<HTMLElement>('.nav-toggle');
  if (!btn || btn.dataset.navInit) return;
  btn.dataset.navInit = '1';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = document.body.classList.toggle('nav-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('nav-open')) return;
    const target = e.target as HTMLElement | null;
    if (target && !target.closest('.site-nav') && !target.closest('.nav-toggle')) {
      document.body.classList.remove('nav-open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

/** DOMParser 生成后再移入正文的媒体节点需要显式启动资源选择。 */
function initEmbeddedMedia(): void {
  for (const media of document.querySelectorAll<HTMLMediaElement>('.markdown-body video, .markdown-body audio')) {
    if (media.dataset.mediaLoaded === '1') continue;
    media.dataset.mediaLoaded = '1';
    media.load();
  }
}

function initNoticeBanners(): void {
  for (const banner of document.querySelectorAll<HTMLElement>(".notice-banner")) {
    if (banner.dataset.bannerInit === "1") continue;
    banner.dataset.bannerInit = "1";
    const delay = Number(banner.dataset.delay || "500");
    setTimeout(() => {
      if (banner.parentElement && !banner.classList.contains("dismissing")) {
        banner.classList.add("visible");
      }
    }, Math.max(0, delay));
  }
}

function updateNavActive(path: string): void {
  const current = new URL(path, location.href).pathname.replace(/\/+$/, '') || '/';
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
  initEmbeddedMedia();
  initHeatmapTooltips();
  initNoticeBanners();
  scheduleTabPrefetch();
}

// ---- 客户端内容交换 ----

let swapping = false;

async function swapContent(
  path: string,
  { push = true, minOverlayMs = 0 }: { push?: boolean; minOverlayMs?: number } = {},
): Promise<void> {
  if (swapping) return;
  swapping = true;
  // 预取/缓存命中时交换几乎瞬时完成；遮罩延迟出现，避免快速切换时闪烁。
  // minOverlayMs > 0 时（如语言切换）遮罩立即出现并至少停留该时长。
  // 遮罩自身完全透明，只作为切换期间的输入门；新页组件延迟到遮罩结束后初始化。
  let loadingTimer: ReturnType<typeof setTimeout> | null = null;
  let overlayShownAt = 0;
  let overlayWasShown = false;
  if (minOverlayMs > 0) {
    showLoading();
    overlayWasShown = true;
    overlayShownAt = Date.now();
  } else {
    loadingTimer = setTimeout(() => {
      showLoading();
      overlayWasShown = true;
    }, 150);
  }
  let activatePage: (() => void) | null = null;
  try {
    const html = await fetchPageHtml(path);
    if (html === null) {
      location.href = path;
      return;
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newMain = doc.querySelector('main.site-main');
    const newFooter = doc.querySelector('footer.site-footer');
    const oldMain = document.querySelector<HTMLElement>('main.site-main');
    const oldFooter = document.querySelector<HTMLElement>('footer.site-footer');
    if (!newMain || !oldMain) {
      location.href = path;
      return;
    }
    // 淡出旧内容（两帧即可，不等完整过渡）
    oldMain.style.opacity = '0';
    await nextPaint();
    // 替换内容
    oldMain.replaceChildren(...newMain.children);
    if (newFooter && oldFooter) {
      oldFooter.replaceChildren(
        ...Array.from(newFooter.childNodes, (node) => node.cloneNode(true)),
      );
    } else if (newFooter && !oldFooter) {
      oldMain.after(newFooter.cloneNode(true));
    } else if (!newFooter && oldFooter) {
      oldFooter.remove();
    }
    replaceContactCard(doc);
    updateNavActive(path);
    // 同步 header 中的导航和语言菜单到新语言（header 不整体替换，保留按钮监听）
    const newNav = doc.querySelector('nav.site-nav');
    const oldNav = document.querySelector<HTMLElement>('nav.site-nav');
    if (newNav && oldNav) {
      const newTitle = newNav.querySelector('.site-title a');
      const oldTitle = oldNav.querySelector('.site-title a');
      // 站点标题链接也必须随语言交换更新；否则 SPA 切换语言后，标题仍指向旧语言/默认语言首页。
      if (newTitle && oldTitle) {
        oldTitle.textContent = newTitle.textContent;
        oldTitle.setAttribute('href', newTitle.getAttribute('href') ?? oldTitle.getAttribute('href') ?? '/');
      }
      const newList = newNav.querySelector('ul');
      const oldList = oldNav.querySelector('ul');
      if (newList && oldList) oldList.replaceChildren(...newList.children);
    }
    const newLangMenu = doc.querySelector('.lang-menu');
    const oldLangMenu = document.querySelector('.lang-menu');
    if (newLangMenu && oldLangMenu) {
      oldLangMenu.replaceChildren(
        ...Array.from(newLangMenu.children, (node) => node.cloneNode(true)),
      );
    }
    // 更新 URL 语言与实际内容语言（回退页两者可以不同）
    document.title = doc.title;
    const nextLanguage = normalizeLanguage(doc.documentElement.dataset.routeLang);
    const nextContentLanguage = normalizeLanguage(doc.documentElement.getAttribute('lang'));
    if (nextLanguage) document.documentElement.dataset.routeLang = nextLanguage;
    if (nextContentLanguage) document.documentElement.setAttribute('lang', nextContentLanguage);
    if (nextLanguage) {
      writePreferredLanguage(nextLanguage);
      if (push) history.pushState(null, '', path);
    }
    document.body.classList.remove('nav-open');
    document.querySelector('.nav-toggle')?.setAttribute('aria-expanded', 'false');
    // 新内容先保持透明，等不可见遮罩完全结束再恢复并启动组件计时/动画。
    activatePage = () => {
      oldMain.style.opacity = '';
      // 重新初始化（动效、流式、灯箱等）
      initAll();
      // 客户端内容交换等价于一次页面加载；联系卡等全局组件依赖此事件重绑。
      window.dispatchEvent(new Event('astro:page-load'));
      window.scrollTo({ top: 0 });
    };
  } catch {
    location.href = path;
  } finally {
    if (loadingTimer !== null) clearTimeout(loadingTimer);
    if (overlayShownAt > 0) {
      const remaining = minOverlayMs - (Date.now() - overlayShownAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    }
    hideLoading();
    // 先让移除遮罩的 class 提交到下一帧，再启动通知横幅、流式输出等计时。
    if (overlayWasShown) await nextPaint();
    activatePage?.();
    swapping = false;
  }
}

function replaceContactCard(doc: Document): void {
  const nextCard = doc.querySelector('.intro-card');
  const currentCard = document.querySelector('.intro-card');
  const nextModal = doc.querySelector('dialog.qr-modal');
  const currentModal = document.querySelector('dialog.qr-modal');

  if (nextCard) {
    const card = nextCard.cloneNode(true);
    if (currentCard) currentCard.replaceWith(card);
    else document.body.insertBefore(card, document.querySelector('.lightbox'));
  } else {
    currentCard?.remove();
  }

  if (nextModal) {
    const modal = nextModal.cloneNode(true);
    if (currentModal) currentModal.replaceWith(modal);
    else document.querySelector('.intro-card')?.after(modal);
  } else {
    currentModal?.remove();
  }
}

function isEditMode(): boolean {
  try {
    return (
      document.documentElement.classList.contains('oh-edit') ||
      document.documentElement.classList.contains('oh-editing') ||
      sessionStorage.getItem('oh-edit') === '1'
    );
  } catch {
    return (
      document.documentElement.classList.contains('oh-edit') ||
      document.documentElement.classList.contains('oh-editing')
    );
  }
}

function isInternalLink(href: string): boolean {
  if (!href.startsWith('/') || href.startsWith('//')) return false;
  return true;
}


// ---- 页面通知横幅关闭 ----

document.addEventListener("click", (e) => {
  const btn = e.target instanceof Element ? e.target.closest<HTMLButtonElement>(".notice-banner-close") : null;
  if (!btn) return;
  const banner = btn.closest<HTMLElement>(".notice-banner");
  if (!banner || banner.classList.contains("dismissing")) return;
  banner.classList.add("dismissing");
  banner.classList.remove("visible");
  banner.addEventListener(
    "transitionend",
    () => {
      banner.remove();
    },
    { once: true }
  );
  setTimeout(() => {
    if (banner.parentElement) banner.remove();
  }, 350);
});

// ---- 导航拦截 ----

document.addEventListener('click', (e) => {
  const link = e.target instanceof Element ? e.target.closest('a') : null;
  if (!link) return;
  // overlay 自身控件（如 ←后台 链接）不拦截
  if (
    link.closest(
      '.oh-topbar, .oh-toolbar, .oh-textedit, .oh-cfgedit, .oh-drawer, .oh-drawer-mask, .oh-inspector, .oh-inspector-mask, .oh-streamedit-mask'
    )
  ) {
    return;
  }
  if (isEditMode()) {
    // 编辑模式下阻止任何页面超链接的默认跳转 / SPA 内容交换，避免破坏编辑状态或意外跳出
    e.preventDefault();
    return;
  }
  const href = link.getAttribute('href') ?? '';
  const selectedLanguage = normalizeLanguage(link.getAttribute('hreflang'));
  // 语言切换器也走内容交换（保留当前页面）
  // 外链 / 锚点不动
  if (!isInternalLink(href) || href.includes('#')) return;
  // 修饰键点击不动
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  if (selectedLanguage) writePreferredLanguage(selectedLanguage);
  // 语言切换即使命中缓存也保留 0.25s 透明输入门，并延迟组件计时/动画
  void swapContent(href, selectedLanguage ? { minOverlayMs: 250 } : {});
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

async function bootstrapLanguage(): Promise<void> {
  if (isEditMode()) return;
  const current = currentRouteLanguage();
  const preferred = readPreferredLanguage() ?? browserLanguage() ?? current;
  if (!preferred) return;
  if (!readPreferredLanguage()) writePreferredLanguage(preferred);
  if (current === preferred) return;
  await swapContent(languagePath(preferred));
}

// 兜底：内联引导脚本不可用时，语言偏好不匹配仍在遮罩下切换。
initAll();
void bootstrapLanguage();

window.addEventListener('popstate', () => {
  void swapContent(location.pathname + location.search, { push: false });
});
