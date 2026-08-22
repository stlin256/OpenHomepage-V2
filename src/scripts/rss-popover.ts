/**
 * RSS 卡片 hover 浮层（docs/specs/05）：
 * - 桌面 hover 300ms 后浮出，离开卡片或浮层 150ms 后收起；
 * - 位置上方/下方自适应（popoverPlacement，src/lib/interactive.ts）；
 * - 触摸环境（hover: none）：点击卡片第一下展开预览，第二下跳原文。
 */
import {
  popoverPlacement,
  POPOVER_SHOW_DELAY,
  POPOVER_HIDE_DELAY,
} from '../lib/interactive.ts';

export function initRssPopovers(): void {
  const hoverCapable = window.matchMedia('(hover: hover)').matches;

  for (const card of document.querySelectorAll<HTMLElement>('.rss-card')) {
    if (card.dataset.popInit) continue; // astro:page-load 重复初始化防御
    card.dataset.popInit = '1';

    const pop = card.querySelector<HTMLElement>('.rss-pop');
    if (!pop) continue;

    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const show = () => {
      clearTimeout(hideTimer);
      const r = card.getBoundingClientRect();
      pop.hidden = false;
      // 读取 offsetHeight 强制回流，保证 .open 过渡生效，同时拿到浮层高度做方向决策
      const placement = popoverPlacement(
        { top: r.top, bottom: r.bottom },
        pop.offsetHeight,
        window.innerHeight,
      );
      pop.dataset.side = placement.side;
      // 两侧都放不下时收缩到可用空间（内部滚动），浮层不被视口截断
      pop.style.maxHeight = `${placement.maxHeight}px`;
      pop.classList.add('open');
    };
    const hide = () => {
      pop.classList.remove('open');
      // 收起动画结束后才 hidden（期间若重新打开则保留）
      setTimeout(() => {
        if (!pop.classList.contains('open')) pop.hidden = true;
      }, 200);
    };
    const scheduleShow = () => {
      clearTimeout(hideTimer);
      clearTimeout(showTimer);
      showTimer = setTimeout(show, POPOVER_SHOW_DELAY);
    };
    const scheduleHide = () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, POPOVER_HIDE_DELAY);
    };

    if (hoverCapable) {
      card.addEventListener('mouseenter', scheduleShow);
      card.addEventListener('mouseleave', scheduleHide);
      pop.addEventListener('mouseenter', () => clearTimeout(hideTimer));
      pop.addEventListener('mouseleave', scheduleHide);
    } else {
      // 触摸：浮层未展开时拦截第一次点击展开预览；已展开则放行跳原文
      card.addEventListener('click', (e) => {
        if (pop.hidden) {
          e.preventDefault();
          show();
        }
      });
    }
  }
}
