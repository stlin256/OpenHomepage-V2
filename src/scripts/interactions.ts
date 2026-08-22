/**
 * 前端交互入口：BaseLayout 以模块脚本引入（打包一次），
 * 依赖 Astro ClientRouter 的 astro:page-load 事件在首屏与每次转场后初始化。
 * 纯决策逻辑全部在 src/lib/interactive.ts（可单测），这里只做 DOM/事件。
 */
import { initStreamBlocks } from './stream-player.ts';
import { initRssPopovers } from './rss-popover.ts';
import { initEmbeds } from './embed.ts';
import { initMotion } from './motion.ts';

function initAll(): void {
  initStreamBlocks();
  initRssPopovers();
  initEmbeds();
  initMotion();
}

document.addEventListener('astro:page-load', initAll);
