/**
 * 动效（docs/specs/09）：滚动显现（IO + CSS）、杂志视差（头像 ≤40px）、
 * 磁吸按钮（导航 tab / 图标 ≤6px）。
 * 规则：仅 transform/opacity；prefers-reduced-motion 或触摸设备关闭视差与磁吸；
 * 无 JS 时 .reveal 不隐藏（初始隐藏态挂在 html.js 下）。
 */
import { magnetOffset, parallaxShift, MAGNET_MAX, PARALLAX_MAX } from '../lib/interactive.ts';

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function coarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

/** 滚动显现：进入视口 10% 即淡入上移，一次性 */
function initReveal(): void {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
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

/** 磁吸：导航 tab / 图标按钮向指针轻微吸附，离开复位 */
function initMagnet(): void {
  for (const el of document.querySelectorAll<HTMLElement>('.site-nav a, .icon-btn')) {
    if (el.dataset.magnetInit) continue;
    el.dataset.magnetInit = '1';
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const { x, y } = magnetOffset(
        e.clientX - (r.left + r.width / 2),
        e.clientY - (r.top + r.height / 2),
        MAGNET_MAX,
      );
      el.style.transform = `translate(${x}px, ${y}px)`;
    });
    el.addEventListener('pointerleave', () => {
      el.style.transform = '';
    });
  }
}

export function initMotion(): void {
  initReveal();
  // spec 09 §2：reduced-motion 与移动端关闭视差/磁吸，保留淡入
  if (reducedMotion() || coarsePointer()) return;
  initParallax();
  initMagnet();
}
