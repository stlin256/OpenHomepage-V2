/**
 * 动效（docs/specs/09）：滚动显现（IO + CSS）、杂志视差（头像 ≤40px）。
 * 规则：仅 transform/opacity；prefers-reduced-motion 或触摸设备关闭视差；
 * 无 JS 时 .reveal 不隐藏（初始隐藏态挂在 html.js 下）。
 * （原磁吸按钮效果已废弃：可点元素 hover 改为传统高亮背景块，纯 CSS。）
 */
import { parallaxShift, PARALLAX_MAX } from '../lib/interactive.ts';

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function coarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

/** 滚动显现：进入视口 10% 即淡入上移，一次性 */
function initReveal(): void {
  // 先把当前视口外的项挂到 pending。首屏保持 CSS 初始可见，不再等 JS；
  // deferred 模块在首次绘制前完成标记，下方内容不会产生可见回退。
  const viewportHeight = window.innerHeight;
  for (const el of document.querySelectorAll<HTMLElement>('.reveal:not(.revealed)')) {
    if (el.getBoundingClientRect().top >= viewportHeight) el.classList.add('reveal-pending');
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.remove('reveal-pending');
          e.target.classList.add('revealed');
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.1 },
  );
  for (const el of document.querySelectorAll('.reveal:not(.revealed)')) io.observe(el);
}

// 视差：scroll 监听模块级只绑一次（ClientRouter 下脚本不重复执行），
// 元素列表每次 page-load 重新收集
let parallaxEls: HTMLElement[] = [];
let parallaxBound = false;

function updateParallax(): void {
  const vh = window.innerHeight;
  for (const el of parallaxEls) {
    const r = el.getBoundingClientRect();
    // 元素中心相对视口中心的归一化位置 ∈ [-1, 1]
    const progress = (r.top + r.height / 2 - vh / 2) / (vh / 2);
    el.style.transform = `translateY(${parallaxShift(progress, PARALLAX_MAX)}px)`;
  }
}

function initParallax(): void {
  parallaxEls = [...document.querySelectorAll<HTMLElement>('[data-parallax]')];
  if (parallaxEls.length === 0) return;
  if (!parallaxBound) {
    parallaxBound = true;
    let ticking = false;
    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(() => {
            ticking = false;
            updateParallax();
          });
        }
      },
      { passive: true },
    );
  }
  updateParallax();
}

export function initMotion(): void {
  initReveal();
  // spec 09 §2：reduced-motion 与移动端关闭视差，保留淡入
  if (reducedMotion() || coarsePointer()) return;
  initParallax();
}
