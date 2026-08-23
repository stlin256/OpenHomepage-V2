/**
 * 前端交互入口：BaseLayout 以模块脚本引入（打包一次），
 * 依赖 Astro ClientRouter 的 astro:page-load 事件在首屏与每次转场后初始化。
 * 纯决策逻辑全部在 src/lib/interactive.ts（可单测），这里只做 DOM/事件。
 * 主题切换（src/scripts/theme.ts）在模块加载时即注册 astro:after-swap 重放（#4）。
 */
import { initStreamBlocks } from './stream-player.ts';
import { initMotion } from './motion.ts';
import { initThemeToggle } from './theme.ts';
import { initBgm } from './bgm.ts';
import './lightbox.ts';

/** 移动端汉堡按钮：切换 body.nav-open 抽屉（转场后 DOM 重建，需重新绑定） */
function initNavToggle(): void {
  const btn = document.querySelector<HTMLElement>('.nav-toggle');
  if (!btn || btn.dataset.navInit) return;
  btn.dataset.navInit = '1';
  btn.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

function initAll(): void {
  initThemeToggle();
  initNavToggle();
  initStreamBlocks();
  initMotion();
  initBgm();
}

document.addEventListener('astro:page-load', initAll);

// 语言切换器菜单开合：点击按钮切换；点别处 / Esc 关闭（事件委托注册一次，
// ClientRouter 转场后新 DOM 仍被覆盖；hover 展开由 CSS 承担）
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

// RSS 封面（多为外链 og:image，见 spec 05）加载失败时隐藏图位：
// 资源 error 事件不冒泡，用捕获阶段委托；ClientRouter 转场后新 DOM 仍被覆盖
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
