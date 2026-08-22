/**
 * 前端交互入口：BaseLayout 以模块脚本引入（打包一次），
 * 依赖 Astro ClientRouter 的 astro:page-load 事件在首屏与每次转场后初始化。
 * 纯决策逻辑全部在 src/lib/interactive.ts（可单测），这里只做 DOM/事件。
 * 主题切换（src/scripts/theme.ts）在模块加载时即注册 astro:after-swap 重放（#4）。
 */
import { initStreamBlocks } from './stream-player.ts';
import { initRssPopovers } from './rss-popover.ts';
import { initMotion } from './motion.ts';
import { initThemeToggle } from './theme.ts';

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
  initRssPopovers();
  initMotion();
}

document.addEventListener('astro:page-load', initAll);
