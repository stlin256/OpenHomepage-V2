/**
 * 贡献热力图格子 tooltip：桌面 hover / 移动端点按显示 "N contributions on …"（文案
 * 构建时已双语内联在格子的 data-tip 上）。单例气泡 fixed 定位，水平 clamp 不溢出
 * 热力图容器（定位纯逻辑在 src/lib/interactive.ts tooltipLeft）。
 * 事件委托注册一次（模块级开关），ClientRouter 转场后新 DOM 仍被覆盖；
 * 转场前移除气泡节点（body 内容会被 swap，引用需置空防泄漏）。
 */
import { tooltipLeft } from '../lib/interactive.ts';

let tip: HTMLElement | null = null;
let tipFor: Element | null = null;
let hideTimer: number | undefined;
let registered = false;

function ensureTip(): HTMLElement {
  if (!tip || !tip.isConnected) {
    tip = document.createElement('div');
    tip.className = 'heat-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.append(tip);
  }
  return tip;
}

function hideTip(): void {
  if (!tip || tip.hidden) return;
  window.clearTimeout(hideTimer);
  tip.classList.remove('is-visible');
  tip.classList.add('is-hiding');
  hideTimer = window.setTimeout(() => {
    if (!tip) return;
    tip.hidden = true;
    tip.classList.remove('is-hiding');
  }, 120);
  tipFor = null;
}

function showTip(cell: Element): void {
  const text = cell.getAttribute('data-tip');
  if (!text) return;
  const el = ensureTip();
  const shouldAnimate = el.hidden || el.classList.contains('is-hiding') || !el.classList.contains('is-visible');
  window.clearTimeout(hideTimer);
  el.textContent = text;
  el.hidden = false;
  // 先渲染量尺寸，再定位：水平 clamp 在热力图滚动容器内，默认格子上方、空间不足改下方
  const cellRect = cell.getBoundingClientRect();
  const container = cell.closest('.heatmap-scroll');
  const cRect = container?.getBoundingClientRect() ?? { left: 0, right: window.innerWidth };
  const tipRect = el.getBoundingClientRect();
  const centerX = cellRect.left + cellRect.width / 2;
  const left = tooltipLeft(centerX, tipRect.width, cRect.left + 4, cRect.right - 4);
  let top = cellRect.top - tipRect.height - 6;
  if (top < 4) top = cellRect.bottom + 6;
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  if (shouldAnimate) {
    el.classList.remove('is-hiding');
    void el.offsetWidth;
    el.classList.add('is-visible');
  }
  tipFor = cell;
}

function cellOf(e: Event): Element | null {
  return e.target instanceof Element ? e.target.closest('.heat-cell[data-tip]') : null;
}

export function initHeatmapTooltips(): void {
  if (registered) return;
  registered = true;

  // 桌面 hover：进入格子显示，移走关闭
  document.addEventListener('mouseover', (e) => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    const cell = cellOf(e);
    if (cell && cell !== tipFor) showTip(cell);
  });
  document.addEventListener('mouseout', (e) => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    if (tipFor && e.target === tipFor && !tipFor.contains(e.relatedTarget as Node | null)) {
      hideTip();
    }
  });

  // 移动端点按：点格子切换显示，再点/点别处关闭
  document.addEventListener('click', (e) => {
    const cell = cellOf(e);
    if (cell) {
      if (tipFor === cell) hideTip();
      else showTip(cell);
    } else if (tipFor) {
      hideTip();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideTip();
  });
  // 容器横向滚动后位置失效，直接关闭
  document.addEventListener('scroll', (e) => {
    if (tipFor && e.target instanceof Element && e.target.classList.contains('heatmap-scroll')) {
      hideTip();
    }
  }, true);
  // ClientRouter 转场会替换 body 内容：丢弃旧气泡引用
  document.addEventListener('astro:before-swap', () => {
    window.clearTimeout(hideTimer);
    tip?.remove();
    tip = null;
    tipFor = null;
  });
}
