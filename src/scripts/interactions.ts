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
/** 语言切换可见遮罩的最短时长：给 FLIP 动画足够的呈现窗口。 */
const LANGUAGE_OVERLAY_MS = 420;

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

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function langForMenuItem(item: Element): string | null {
  return item.querySelector('a[hreflang]')?.getAttribute('hreflang') ?? null;
}

function sameLanguageSet(a: Element, b: Element): boolean {
  const left = new Set([...a.querySelectorAll('a[hreflang]')].map((link) => link.getAttribute('hreflang')));
  const right = new Set([...b.querySelectorAll('a[hreflang]')].map((link) => link.getAttribute('hreflang')));
  if (left.size !== right.size) return false;
  for (const lang of left) {
    if (!right.has(lang)) return false;
  }
  return true;
}

/**
 * Language menu option A: FLIP float-and-settle.
 * Record old positions, move the selected language to the top immediately, then
 * animate it back from its old position while sibling rows stagger downward.
 */
function animateLangMenuSelection(link: HTMLAnchorElement): boolean {
  const menu = link.closest('.lang-menu');
  const selectedItem = link.closest('li');
  const selectedLang = link.getAttribute('hreflang');
  if (!menu || !selectedItem || !selectedLang) return false;

  const items = [...menu.children].filter((item): item is HTMLElement => item instanceof HTMLElement);
  const before = new Map<string, DOMRect>();
  for (const item of items) {
    const lang = langForMenuItem(item);
    if (lang) before.set(lang, item.getBoundingClientRect());
  }

  // Match build-time orderLangMenu: selected language first, others in site order.
  const menuLangs = items.map(langForMenuItem).filter((lang): lang is string => Boolean(lang));
  const baseLangs = siteLanguages().filter((lang) => menuLangs.includes(lang));
  const extraLangs = menuLangs.filter((lang) => !baseLangs.includes(lang));
  const byLang = new Map(items.map((item) => [langForMenuItem(item), item] as const));
  const orderedLangs = [
    selectedLang,
    ...baseLangs.filter((lang) => lang !== selectedLang),
    ...extraLangs.filter((lang) => lang !== selectedLang),
  ];
  for (const lang of orderedLangs) {
    const item = byLang.get(lang);
    if (item) menu.append(item);
  }

  for (const item of menu.querySelectorAll('li')) {
    const itemLink = item.querySelector('a[hreflang]');
    if (!itemLink) continue;
    const active = itemLink === link;
    itemLink.classList.toggle('active', active);
    if (active) itemLink.setAttribute('aria-current', 'true');
    else itemLink.removeAttribute('aria-current');
  }

  if (prefersReducedMotion()) return true;

  for (const [index, item] of [...menu.children].entries()) {
    if (!(item instanceof HTMLElement)) continue;
    const lang = langForMenuItem(item);
    if (!lang) continue;
    const oldRect = before.get(lang);
    const delta = oldRect ? oldRect.top - item.getBoundingClientRect().top : 0;
    if (delta === 0 || typeof item.animate !== 'function') continue;

    if (item === selectedItem) {
      // 比初版 A 方案更明确：右侧轻微避让 -> 上浮 -> 左侧轻微回弹，
      // 避免只有一行位移时被用户感知成瞬时换序。
      item.animate(
        [
          {
            transform: `translateY(${delta}px) translateX(12px) scale(0.96)`,
            opacity: '0.58',
            offset: 0,
          },
          {
            transform: `translateY(${delta * 0.45}px) translateX(-4px) scale(1.025)`,
            opacity: '1',
            offset: 0.58,
          },
          { transform: 'translateY(0px) translateX(0px) scale(1)', opacity: '1' },
        ],
        { duration: 560, easing: 'cubic-bezier(0.2, 1.12, 0.24, 1)' },
      );
    } else {
      item.animate(
        [
          { transform: `translateY(${delta}px)`, opacity: '0.62' },
          { transform: `translateY(${delta * 0.52}px)`, opacity: '0.96', offset: 0.55 },
          { transform: 'translateY(0px)', opacity: '1' },
        ],
        {
          duration: 470,
          delay: 25 + index * 35,
          easing: 'cubic-bezier(0.24, 0.86, 0.18, 1)',
          fill: 'backwards',
        },
      );
    }
  }

  return true;
}

const CHROME_FADE_OUT_MS = 90;

function childNodesChanged(container: Element, nodes: Node[]): boolean {
  const current = Array.from(container.childNodes);
  return (
    current.length !== nodes.length ||
    nodes.some((node, index) => !node.isEqualNode(current[index] ?? null))
  );
}

/**
 * SPA 语言/页面交换时同步 header 与页脚：先短暂淡出旧 chrome，
 * 再替换节点并利用基础 transition 淡入。内容不变时不触发动画。
 */
async function replaceChildrenWithFade(container: Element, buildNodes: () => Node[]): Promise<void> {
  const nodes = buildNodes();
  if (!childNodesChanged(container, nodes)) return;
  container.classList.add('chrome-fade-out');
  await new Promise((resolve) => setTimeout(resolve, CHROME_FADE_OUT_MS));
  container.replaceChildren(...nodes);
  container.classList.remove('chrome-fade-out');
}

async function removeWithFade(element: Element): Promise<void> {
  element.classList.add('chrome-fade-out');
  await new Promise((resolve) => setTimeout(resolve, CHROME_FADE_OUT_MS));
  element.remove();
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
  { push = true, minOverlayMs = 0, preserveLangMenu = false }: { push?: boolean; minOverlayMs?: number; preserveLangMenu?: boolean } = {},
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
    oldMain.style.transform = 'translateY(-8px)';
    await nextPaint();
    // 替换内容；新内容先停在下方位移，遮罩结束后再上移淡入。
    oldMain.replaceChildren(...newMain.children);
    oldMain.style.opacity = '0';
    oldMain.style.transform = 'translateY(12px)';
    const newNav = doc.querySelector('nav.site-nav');
    const oldNav = document.querySelector<HTMLElement>('nav.site-nav');
    const newTitle = newNav?.querySelector('.site-title a');
    const oldTitle = oldNav?.querySelector('.site-title');
    const newList = newNav?.querySelector('ul');
    const oldList = oldNav?.querySelector('ul');

    const chromeSwaps: Promise<void>[] = [];
    if (oldTitle) {
      chromeSwaps.push(
        replaceChildrenWithFade(oldTitle, () =>
          newTitle ? [newTitle.cloneNode(true)] : [],
        ),
      );
    }
    if (oldList && newList) {
      chromeSwaps.push(
        replaceChildrenWithFade(oldList, () => Array.from(newList.children, (node) => node.cloneNode(true))),
      );
    }
    if (newFooter && oldFooter) {
      chromeSwaps.push(
        replaceChildrenWithFade(oldFooter, () => Array.from(newFooter.childNodes, (node) => node.cloneNode(true))),
      );
    } else if (!newFooter && oldFooter) {
      chromeSwaps.push(removeWithFade(oldFooter));
    }
    await Promise.all(chromeSwaps);

    if (newFooter && !oldFooter) {
      const addedFooter = newFooter.cloneNode(true);
      oldMain.after(addedFooter);
    }
    replaceContactCard(doc);
    updateNavActive(path);
    // header 的站点标题、导航列表与页脚已在上方按需淡入淡出替换。
    const newLangMenu = doc.querySelector('.lang-menu');
    const oldLangMenu = document.querySelector('.lang-menu');
    // The click-time FLIP pass already owns menu order; preserving equal nodes
    // prevents replacement from cutting the motion halfway. Normal swaps still sync it.
    if (
      newLangMenu &&
      oldLangMenu &&
      !(preserveLangMenu && sameLanguageSet(newLangMenu, oldLangMenu))
    ) {
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
    // 新内容先保持透明，等可见遮罩完全结束再恢复并启动组件计时/动画。
    activatePage = () => {
      oldMain.style.opacity = '';
      oldMain.style.transform = '';
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
    // 先让移除遮罩 class 与新内容初始位移提交到下一帧，再启动进入动画和组件计时。
    await nextPaint();
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
  if (selectedLanguage) {
    // hover 打开的菜单没有 .open 状态；点击语言项时显式锁定打开，
    // 保证鼠标稍微移动或页面滚动时 FLIP 动画不会被 hover 断掉。
    link.closest('.lang-menu')?.classList.add('open');
    link
      .closest('.lang-switcher')
      ?.querySelector('.lang-toggle')
      ?.setAttribute('aria-expanded', 'true');
  }
  const langMenuAnimated = selectedLanguage ? animateLangMenuSelection(link) : false;
  if (selectedLanguage) writePreferredLanguage(selectedLanguage);
  // 语言切换保留 0.42s 可见遮罩，并延迟组件计时/动画；
  // 菜单 FLIP 与内容交换并行，遮罩不遮挡右上语言菜单。
  void swapContent(href, {
    minOverlayMs: selectedLanguage ? LANGUAGE_OVERLAY_MS : 0,
    preserveLangMenu: langMenuAnimated,
  });
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
  // 点击语言项本身时保持菜单打开：FLIP 换序动画需要菜单继续可见。
  if (e.target instanceof Element && e.target.closest('.lang-menu')) return;
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
